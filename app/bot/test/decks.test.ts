import { describe, it, expect, vi, afterEach } from 'vitest'
import * as dbModule from '@revelio/db'
import { parseDeckRef, getPublicDeck } from '../src/data/decks'

afterEach(() => vi.restoreAllMocks())

describe('parseDeckRef', () => {
  it('accepts a bare id', () => {
    expect(parseDeckRef('abc123')).toBe('abc123')
  })

  it('accepts an English deck URL', () => {
    expect(parseDeckRef('https://revelio.cards/decks/abc123')).toBe('abc123')
  })

  it('accepts a locale-prefixed deck URL', () => {
    expect(parseDeckRef('https://revelio.cards/de/decks/abc123')).toBe('abc123')
  })

  it('accepts a localhost URL', () => {
    expect(parseDeckRef('http://localhost:3000/decks/abc123')).toBe('abc123')
  })

  it('drops a query string and a trailing slash', () => {
    expect(parseDeckRef('https://revelio.cards/decks/abc123/?utm_source=x')).toBe('abc123')
  })

  it('trims surrounding whitespace', () => {
    expect(parseDeckRef('  abc123  ')).toBe('abc123')
  })
})

const views = [
  { cardId: 'c1', zone: 'character', quantity: 1, name: 'Harry Potter', cost: null, lesson: null, types: ['character'], subTypes: ['wizard'], isLesson: false, isStartingCharacter: true, isOfficial: true, legality: 'legal' },
  { cardId: 'c2', zone: 'main', quantity: 4, name: 'Alohomora', cost: 2, lesson: 'charms', types: ['spell'], subTypes: [], isLesson: false, isStartingCharacter: false, isOfficial: true, legality: 'legal' },
  { cardId: 'c3', zone: 'main', quantity: 8, name: 'Charms Lesson', cost: 0, lesson: 'charms', types: ['lesson'], subTypes: [], isLesson: true, isStartingCharacter: false, isOfficial: true, legality: 'legal' },
  { cardId: 'c4', zone: 'sideboard', quantity: 2, name: 'Nimbus 2000', cost: 4, lesson: 'quidditch', types: ['item'], subTypes: [], isLesson: false, isStartingCharacter: false, isOfficial: true, legality: 'legal' },
]

export function stubDeck() {
  return {
    deck: {
      id: 'abc123', name: 'Charms Aggro', format: 'classic', visibility: 'public',
      cards: views.map((v) => ({ cardId: v.cardId, zone: v.zone, quantity: v.quantity })),
      createdAt: '2026-01-01', updatedAt: '2026-01-02',
    },
    userId: 'u1',
    views,
    viewCount: 7,
    ownerUsername: 'seeker',
  }
}

describe('getPublicDeck', () => {
  it('reads through getDeckForViewer with a null viewer', async () => {
    const spy = vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    await getPublicDeck({} as never, 'https://revelio.cards/decks/abc123')
    expect(spy).toHaveBeenCalledWith({}, 'abc123', null)
  })

  it('returns null for a deck that is not public', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(null)
    expect(await getPublicDeck({} as never, 'abc123')).toBeNull()
  })

  it('splits the zones and counts each one', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const deck = await getPublicDeck({} as never, 'abc123')
    expect(deck!.character?.name).toBe('Harry Potter')
    expect(deck!.mainCount).toBe(12)
    expect(deck!.sideboardCount).toBe(2)
    expect(deck!.sideboard.map((c) => c.name)).toEqual(['Nimbus 2000'])
  })

  it('orders the main deck by cost, then by name', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const deck = await getPublicDeck({} as never, 'abc123')
    expect(deck!.main.map((c) => c.name)).toEqual(['Charms Lesson', 'Alohomora'])
  })

  it('reports the most-used lesson', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    expect((await getPublicDeck({} as never, 'abc123'))!.topLesson).toBe('charms')
  })

  it('evaluates legality with the shared rules', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    // 12 main-deck cards is short of 60, so the shared evaluator says incomplete.
    expect((await getPublicDeck({} as never, 'abc123'))!.status).toBe('incomplete')
  })

  it('carries the owner username through', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    expect((await getPublicDeck({} as never, 'abc123'))!.ownerUsername).toBe('seeker')
  })
})
