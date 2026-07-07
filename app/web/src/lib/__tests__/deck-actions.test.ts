import { it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ user: { id: 'u1' } })),
  createDeck: vi.fn(async () => 'new-id'),
  updateDeck: vi.fn(async () => {}),
  updateDeckMeta: vi.fn(async () => {}),
  deleteDeck: vi.fn(async () => {}),
  getDeck: vi.fn(async () => ({ userId: 'u1', deck: { name: 'D', format: 'revival', visibility: 'private', cards: [] } })),
  revalidatePath: vi.fn(),
  getSearchClient: vi.fn(() => 'client'),
  runSearch: vi.fn(async () => ({ hits: [], total: 0, page: 1, hitsPerPage: 24 })),
}))
vi.mock('@/lib/session', () => ({ getSession: m.getSession }))
vi.mock('@/lib/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({
  createDeck: m.createDeck,
  updateDeck: m.updateDeck,
  updateDeckMeta: m.updateDeckMeta,
  deleteDeck: m.deleteDeck,
  getDeck: m.getDeck,
}))
vi.mock('next/cache', () => ({ revalidatePath: m.revalidatePath }))
vi.mock('@/lib/search-client', () => ({ getSearchClient: m.getSearchClient, runSearch: m.runSearch }))

import { createDeckAction, updateDeckAction, updateDeckMetaAction, deleteDeckAction, duplicateDeckAction, searchDeckCards } from '../deck-actions'

const validInput = { name: 'D', format: 'revival', visibility: 'private', cards: [{ cardId: 'x', zone: 'main', quantity: 4 }] }

beforeEach(() => {
  Object.values(m).forEach((f) => 'mockReset' in f && f.mockReset())
  m.getSession.mockResolvedValue({ user: { id: 'u1' } })
  m.getDeck.mockResolvedValue({ userId: 'u1', deck: { name: 'D', format: 'revival', visibility: 'private', cards: [] } })
})

it('rejects create when logged out', async () => {
  m.getSession.mockResolvedValueOnce(null as never)
  expect(await createDeckAction(validInput)).toEqual({ ok: false, error: 'auth' })
})

it('creates with the session user id', async () => {
  const r = await createDeckAction(validInput)
  expect(r).toEqual({ ok: true, id: 'new-id' })
  expect(m.createDeck).toHaveBeenCalledWith(expect.anything(), 'u1', expect.objectContaining({ name: 'D' }))
})

it('rejects invalid input', async () => {
  expect(await createDeckAction({ name: '', format: 'nope', cards: [] })).toEqual({ ok: false, error: 'invalid' })
})

it('rejects update on a deck owned by someone else', async () => {
  m.getDeck.mockResolvedValueOnce({ userId: 'other', deck: {} } as never)
  expect(await updateDeckAction('d1', validInput)).toEqual({ ok: false, error: 'forbidden' })
  expect(m.updateDeck).not.toHaveBeenCalled()
})

it('rejects delete on a deck owned by someone else', async () => {
  m.getDeck.mockResolvedValueOnce({ userId: 'other', deck: {} } as never)
  expect(await deleteDeckAction('d1')).toEqual({ ok: false, error: 'forbidden' })
  expect(m.deleteDeck).not.toHaveBeenCalled()
})

it('rejects meta update when logged out', async () => {
  m.getSession.mockResolvedValueOnce(null as never)
  expect(await updateDeckMetaAction('d1', { name: 'New Name' })).toEqual({ ok: false, error: 'auth' })
  expect(m.updateDeckMeta).not.toHaveBeenCalled()
})

it('rejects meta update on a deck owned by someone else', async () => {
  m.getDeck.mockResolvedValueOnce({ userId: 'other', deck: {} } as never)
  expect(await updateDeckMetaAction('d1', { name: 'New Name' })).toEqual({ ok: false, error: 'forbidden' })
  expect(m.updateDeckMeta).not.toHaveBeenCalled()
})

it('rejects invalid meta input', async () => {
  expect(await updateDeckMetaAction('d1', { name: '' })).toEqual({ ok: false, error: 'invalid' })
  expect(await updateDeckMetaAction('d1', { visibility: 'nope' })).toEqual({ ok: false, error: 'invalid' })
  expect(m.updateDeckMeta).not.toHaveBeenCalled()
})

it('updates only the provided meta fields, leaving cards untouched', async () => {
  const r = await updateDeckMetaAction('d1', { name: 'Renamed' })
  expect(r).toEqual({ ok: true, id: 'd1' })
  expect(m.updateDeckMeta).toHaveBeenCalledWith(expect.anything(), 'd1', { name: 'Renamed' })
})

it('toggles visibility via meta update', async () => {
  const r = await updateDeckMetaAction('d1', { visibility: 'public' })
  expect(r).toEqual({ ok: true, id: 'd1' })
  expect(m.updateDeckMeta).toHaveBeenCalledWith(expect.anything(), 'd1', { visibility: 'public' })
})

it('rejects duplicate when logged out', async () => {
  m.getSession.mockResolvedValueOnce(null as never)
  expect(await duplicateDeckAction('d1')).toEqual({ ok: false, error: 'auth' })
  expect(m.createDeck).not.toHaveBeenCalled()
})

it('rejects duplicate on a deck owned by someone else', async () => {
  m.getDeck.mockResolvedValueOnce({ userId: 'other', deck: { name: 'D', format: 'revival', visibility: 'private', cards: [] } } as never)
  expect(await duplicateDeckAction('d1')).toEqual({ ok: false, error: 'forbidden' })
  expect(m.createDeck).not.toHaveBeenCalled()
})

it('duplicates a deck with the session user id and suffixed name', async () => {
  const deckCards = [{ cardId: 'x', zone: 'main' as const, quantity: 4 }]
  m.getDeck.mockResolvedValueOnce({
    userId: 'u1',
    deck: { name: 'Original Deck', format: 'revival', visibility: 'private', cards: deckCards },
  } as never)
  const r = await duplicateDeckAction('d1')
  expect(r).toEqual({ ok: true, id: 'new-id' })
  expect(m.createDeck).toHaveBeenCalledWith(
    expect.anything(),
    'u1',
    expect.objectContaining({
      name: 'Original Deck (copy)',
      format: 'revival',
      visibility: 'private',
      cards: deckCards,
    }),
  )
})

it('searchDeckCards restricts classic to official sets only', async () => {
  await searchDeckCards('en', { query: 'accio', format: 'classic', lessons: ['charms'] })
  expect(m.runSearch).toHaveBeenCalledWith(
    'client',
    'en',
    expect.objectContaining({ q: 'accio', official: true, lessons: ['charms'] }),
    expect.objectContaining({ hitsPerPage: 30 }),
  )
})

it('searchDeckCards searches all sets (official: null) for revival', async () => {
  await searchDeckCards('en', { format: 'revival' })
  expect(m.runSearch).toHaveBeenCalledWith('client', 'en', expect.objectContaining({ official: null }), expect.objectContaining({ hitsPerPage: 30 }))
})

it('searchDeckCards forwards the advanced filters (types/rarities/finishes/legalities/cost/set) into the search state', async () => {
  await searchDeckCards('en', {
    format: 'revival',
    types: ['character'],
    rarities: ['rare'],
    finishes: ['foil'],
    legalities: ['banned'],
    set: 'BS',
    costMin: 1,
    costMax: 4,
  })
  expect(m.runSearch).toHaveBeenCalledWith(
    'client',
    'en',
    expect.objectContaining({
      types: ['character'], rarities: ['rare'], finishes: ['foil'], legalities: ['banned'],
      set: 'BS', costMin: 1, costMax: 4,
    }),
    expect.objectContaining({ hitsPerPage: 30 }),
  )
})

it('searchDeckCards rejects an invalid shape', async () => {
  await expect(searchDeckCards('en', { format: 'not-a-format' })).rejects.toThrow()
})
