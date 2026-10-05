import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getCardViews = vi.fn()
const renderDeckSheet = vi.fn()

vi.mock('@/lib/server/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({ getCardViews: (...args: unknown[]) => getCardViews(...args) }))
vi.mock('@/lib/server/sheet', () => ({ renderDeckSheet: (...args: unknown[]) => renderDeckSheet(...args) }))

const { POST } = await import('../route')

const meta = {
  cardId: 'harry', name: 'Harry Potter', setCode: 'base', types: ['character'], imageVersion: 7,
  orientation: null, cost: 3, damage: null, number: '1', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: true,
  artCropVersion: null,
}

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(new Request('http://localhost/api/deck-sheet', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': `test-${Math.random()}`, ...headers },
    body: JSON.stringify(body),
  }))
}

const body = {
  name: 'Charms Aggro', format: 'classic', locale: 'en',
  cards: [{ cardId: 'harry', zone: 'main', quantity: 2 }],
}

beforeEach(() => {
  getCardViews.mockResolvedValue({ harry: meta })
  renderDeckSheet.mockResolvedValue({ body: Buffer.from('png-bytes'), contentType: 'image/png' })
})
afterEach(() => { vi.clearAllMocks() })

describe('POST /api/deck-sheet', () => {
  it('resolves the painted metadata server-side and streams the image back', async () => {
    const res = await post(body)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe('png-bytes')

    const [sent] = renderDeckSheet.mock.calls[0]
    expect(sent.entries).toEqual([{
      cardId: 'harry', zone: 'main', quantity: 2, name: 'Harry Potter',
      setCode: 'base', types: ['character'], imageVersion: 7, orientation: null,
    }])
    expect(sent.maxBytes).toBeUndefined()
  })

  it('ignores a name, an image version or types the client tried to supply', async () => {
    // The sheet paints names; a client-supplied one would have the service draw
    // whatever the caller asked for, served from this origin.
    await post({
      ...body,
      cards: [{ cardId: 'harry', zone: 'main', quantity: 2, name: 'Not A Card', imageVersion: 999, types: ['spell'] }],
    })
    const [sent] = renderDeckSheet.mock.calls[0]
    expect(sent.entries[0].name).toBe('Harry Potter')
    expect(sent.entries[0].imageVersion).toBe(7)
    expect(sent.entries[0].types).toEqual(['character'])
  })

  it('drops a card id the database does not know', async () => {
    getCardViews.mockResolvedValue({})
    const res = await post(body)
    expect(res.status).toBe(400)
    expect(renderDeckSheet).not.toHaveBeenCalled()
  })

  it('rejects a malformed body without touching the database', async () => {
    expect((await post({ ...body, format: 'commander' })).status).toBe(400)
    expect((await post({ ...body, locale: 'fr' })).status).toBe(400)
    expect((await post({ ...body, cards: [] })).status).toBe(400)
    expect((await post({ ...body, cards: [{ cardId: 'x', zone: 'graveyard', quantity: 1 }] })).status).toBe(400)
    expect(getCardViews).not.toHaveBeenCalled()
  })

  it('refuses a deck past the entry cap', async () => {
    const cards = Array.from({ length: 401 }, (_, i) => ({ cardId: `c${i}`, zone: 'main', quantity: 1 }))
    expect((await post({ ...body, cards })).status).toBe(400)
  })

  it('answers 502 when the service cannot draw', async () => {
    renderDeckSheet.mockRejectedValue(new Error('sheet service answered 503'))
    const res = await post(body)
    expect(res.status).toBe(502)
  })

  it('spends a per-IP budget', async () => {
    const ip = `fixed-${Math.random()}`
    const statuses: number[] = []
    for (let i = 0; i < 12; i += 1) statuses.push((await post(body, { 'x-real-ip': ip })).status)
    expect(statuses.filter((s) => s === 200)).toHaveLength(10)
    expect(statuses.filter((s) => s === 429)).toHaveLength(2)
  })
})
