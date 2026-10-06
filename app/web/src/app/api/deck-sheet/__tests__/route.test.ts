import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DeckSheetRequest, SHEET_FIELD_LIMITS } from '@revelio/core'

const getCardViews = vi.fn()
const renderDeckSheet = vi.fn()

vi.mock('@/lib/server/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({ getCardViews: (...args: unknown[]) => getCardViews(...args) }))
vi.mock('@/lib/server/sheet', () => ({ renderDeckSheet: (...args: unknown[]) => renderDeckSheet(...args) }))
vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale }: { locale: string }) => (key: string) => `${locale}:${key}`,
}))

const { POST } = await import('../route')

const meta = {
  cardId: 'harry', name: 'Harry Potter', setCode: 'base', types: ['character'], imageVersion: 7,
  orientation: null, cost: 3, damage: null, number: '1', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: true,
  artCropVersion: null,
}

function postRaw(body: BodyInit, headers: Record<string, string> = {}) {
  return POST(new Request('http://localhost/api/deck-sheet', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': `test-${Math.random()}`, ...headers },
    body,
    duplex: 'half',
  } as RequestInit))
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
  renderDeckSheet.mockImplementation(async () => ({
    body: new Response('png-bytes').body, contentType: 'image/png', contentLength: '9',
  }))
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
      artCropVersion: null,
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

  it('refuses a declared body past the cap before reading it', async () => {
    const res = await postRaw('{}', { 'content-length': String(10 * 1024 * 1024) })
    expect(res.status).toBe(413)
    expect(getCardViews).not.toHaveBeenCalled()
  })

  it('stops reading an undeclared body once it passes the cap', async () => {
    // A chunked upload has no content-length to refuse up front; the read
    // itself has to give up rather than buffer whatever is sent.
    let pulled = 0
    const chunk = new Uint8Array(64 * 1024).fill(32)
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        if (pulled > 1000) controller.close()
        else controller.enqueue(chunk)
      },
    })
    const res = await postRaw(stream)
    expect(res.status).toBe(413)
    expect(pulled).toBeLessThan(10)
    expect(getCardViews).not.toHaveBeenCalled()
  })

  it('answers 400 to a body that is not JSON', async () => {
    expect((await postRaw('not json')).status).toBe(400)
    expect(getCardViews).not.toHaveBeenCalled()
  })

  it('clamps a deck name the sheet cannot carry instead of failing the export', async () => {
    // The builder's name field has no maxLength; the service rejects a name
    // past SHEET_FIELD_LIMITS.nameInput, which would make the deck's export
    // fail forever.
    const res = await post({ ...body, name: 'x'.repeat(5000) })
    expect(res.status).toBe(200)
    const [sent] = renderDeckSheet.mock.calls[0]
    expect(sent.deck.name.length).toBeLessThanOrEqual(SHEET_FIELD_LIMITS.nameInput)
    expect(DeckSheetRequest.safeParse(sent).success).toBe(true)
  })

  it('falls back to the untitled name when nothing paintable is left', async () => {
    const res = await post({ ...body, locale: 'de', name: '\u0001\u202E\u0002' })
    expect(res.status).toBe(200)
    const [sent] = renderDeckSheet.mock.calls[0]
    expect(sent.deck.name).toBe('de:namePlaceholder')
    expect(DeckSheetRequest.safeParse(sent).success).toBe(true)
  })

  it('passes the service body and its length through without buffering it', async () => {
    const res = await post(body)
    expect(res.headers.get('content-length')).toBe('9')
    expect(res.body).toBe((await renderDeckSheet.mock.results[0].value).body)
  })

  it('merges a card posted twice in one zone into one entry', async () => {
    // The builder never sends this, but a hand-made body would otherwise paint
    // the card twice and count it twice in its section.
    await post({ ...body, cards: [
      { cardId: 'harry', zone: 'main', quantity: 2 },
      { cardId: 'harry', zone: 'main', quantity: 3 },
      { cardId: 'harry', zone: 'sideboard', quantity: 1 },
    ] })
    const [sent] = renderDeckSheet.mock.calls[0]
    expect(sent.entries.map((e: { zone: string; quantity: number }) => [e.zone, e.quantity]))
      .toEqual([['main', 5], ['sideboard', 1]])
  })

  it('caps a merged quantity at what the service carries', async () => {
    await post({ ...body, cards: [
      { cardId: 'harry', zone: 'main', quantity: 999 },
      { cardId: 'harry', zone: 'main', quantity: 999 },
    ] })
    const [sent] = renderDeckSheet.mock.calls[0]
    expect(sent.entries[0].quantity).toBe(999)
    expect(DeckSheetRequest.safeParse(sent).success).toBe(true)
  })

  it('refuses a card id outside the pattern every real id follows', async () => {
    expect((await post({ ...body, cards: [{ cardId: '../etc', zone: 'main', quantity: 1 }] })).status).toBe(400)
    expect(getCardViews).not.toHaveBeenCalled()
  })
})
