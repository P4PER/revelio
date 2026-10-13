import { describe, it, expect, vi, afterEach } from 'vitest'
import * as dbModule from '@revelio/db'
import { parseDeckRef, getDeckView, resolveDeckRef, suggestionLabel, findDecks } from '../src/data/decks'

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
  { cardId: 'c1', setCode: 'BS', number: '1', zone: 'character', quantity: 1, name: 'Harry Potter', cost: null, lesson: null, types: ['character'], subTypes: ['wizard'], isLesson: false, isStartingCharacter: true, isOfficial: true, legality: 'legal' },
  { cardId: 'c2', setCode: 'BS', number: '75', zone: 'main', quantity: 4, name: 'Alohomora', cost: 2, lesson: 'charms', types: ['spell'], subTypes: [], isLesson: false, isStartingCharacter: false, isOfficial: true, legality: 'legal' },
  { cardId: 'c3', setCode: 'BS', number: '112', zone: 'main', quantity: 8, name: 'Charms Lesson', cost: 0, lesson: 'charms', types: ['lesson'], subTypes: [], isLesson: true, isStartingCharacter: false, isOfficial: true, legality: 'legal' },
  { cardId: 'c4', setCode: 'QC', number: '8', zone: 'sideboard', quantity: 2, name: 'Nimbus 2000', cost: 4, lesson: 'quidditch', types: ['item'], subTypes: [], isLesson: false, isStartingCharacter: false, isOfficial: true, legality: 'legal' },
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

describe('getDeckView', () => {
  it('carries the deck\'s visibility', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    expect((await getDeckView({} as never, 'abc123', null))!.visibility).toBe('public')
  })

  it('carries each entry\'s set code and number for the list view', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const deck = await getDeckView({} as never, 'abc123', null)
    expect(deck!.main.map((c) => `${c.setCode} ${c.number}`)).toEqual(['BS 112', 'BS 75'])
    expect(deck!.sideboard[0]).toMatchObject({ setCode: 'QC', number: '8' })
  })

  it('reads through getDeckForViewer with the viewer it was given', async () => {
    const spy = vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    await getDeckView({} as never, 'https://revelio.cards/decks/abc123', 'user-1')
    expect(spy).toHaveBeenCalledWith({}, 'abc123', 'user-1')
  })

  it('returns null for a deck that is not public', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(null)
    expect(await getDeckView({} as never, 'abc123', null)).toBeNull()
  })

  it('splits the zones and counts each one', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const deck = await getDeckView({} as never, 'abc123', null)
    expect(deck!.character?.name).toBe('Harry Potter')
    expect(deck!.mainCount).toBe(12)
    expect(deck!.sideboardCount).toBe(2)
    expect(deck!.sideboard.map((c) => c.name)).toEqual(['Nimbus 2000'])
  })

  it('orders the main deck by cost, then by name', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const deck = await getDeckView({} as never, 'abc123', null)
    expect(deck!.main.map((c) => c.name)).toEqual(['Charms Lesson', 'Alohomora'])
  })

  it('reports the most-used lesson', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    expect((await getDeckView({} as never, 'abc123', null))!.topLesson).toBe('charms')
  })

  it('evaluates legality with the shared rules', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    // 12 main-deck cards is short of 60, so the shared evaluator says incomplete.
    expect((await getDeckView({} as never, 'abc123', null))!.status).toBe('incomplete')
  })

  // The deck image lays these out through the shared deck sheet, which keeps
  // the order it is given, so the order has to be settled here.
  it('lists every view as sheet entries, character first, each zone by cost then name', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    const deck = (await getDeckView({} as never, 'abc123', null))!
    expect(deck.entries.map((e) => e.cardId)).toEqual(['c1', 'c3', 'c2', 'c4'])
    expect(deck.entries[0]).toMatchObject({ zone: 'character', name: 'Harry Potter' })
  })

  it('orders the sheet entries the same whatever order the rows arrive in', async () => {
    const stub = stubDeck()
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue({ ...stub, views: [...stub.views].reverse() } as never)
    const deck = (await getDeckView({} as never, 'abc123', null))!
    expect(deck.entries.map((e) => e.cardId)).toEqual(['c1', 'c3', 'c2', 'c4'])
  })

  it('carries the owner username through', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubDeck() as never)
    expect((await getDeckView({} as never, 'abc123', null))!.ownerUsername).toBe('seeker')
  })
})

describe('getDeckView lesson tiebreak', () => {
  // deck_cards is read without an ORDER BY (db/src/queries/decks.ts), so two lessons on
  // equal copies must not resolve by row order - the accent colour would flip
  // between two identical lookups of the same deck.
  const tied = [
    { cardId: 'a', zone: 'main', quantity: 4, name: 'A', cost: 1, lesson: 'potions', isLesson: false, isStartingCharacter: false, isOfficial: true, legality: 'legal' },
    { cardId: 'b', zone: 'main', quantity: 4, name: 'B', cost: 1, lesson: 'charms', isLesson: false, isStartingCharacter: false, isOfficial: true, legality: 'legal' },
  ]

  function stubWith(views: unknown[]) {
    return {
      deck: { id: 'd', name: 'Tied', format: 'classic', visibility: 'public', cards: [], createdAt: '', updatedAt: '' },
      userId: 'u1', views, viewCount: 0, ownerUsername: null,
    }
  }

  it('resolves a copy-count tie the same way whatever order the rows arrive in', async () => {
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubWith(tied) as never)
    const forward = (await getDeckView({} as never, 'd', null))!.topLesson
    vi.spyOn(dbModule, 'getDeckForViewer').mockResolvedValue(stubWith([...tied].reverse()) as never)
    const reversed = (await getDeckView({} as never, 'd', null))!.topLesson
    expect(forward).toBe(reversed)
  })
})

const suggestion = (over: Partial<dbModule.DeckSuggestion> = {}): dbModule.DeckSuggestion => ({
  id: 'd1', name: 'Gryffindor Aggro', format: 'classic', author: 'seeker',
  visibility: 'public', isOwn: false, exactName: false, ...over,
})

describe('suggestionLabel', () => {
  it('reads name, author and format', () => {
    expect(suggestionLabel(suggestion(), 'en')).toBe('Gryffindor Aggro · @seeker · Classic')
  })

  it('marks a private deck with a lock', () => {
    expect(suggestionLabel(suggestion({ visibility: 'private', isOwn: true }), 'en'))
      .toBe('🔒 Gryffindor Aggro · @seeker · Classic')
  })

  it('clamps to Discord\'s 100 character limit', () => {
    expect(suggestionLabel(suggestion({ name: 'x'.repeat(200) }), 'en').length).toBe(100)
  })
})

describe('findDecks', () => {
  it('asks for at most 25 suggestions for the given viewer', async () => {
    const spy = vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([])
    await findDecks({} as never, 'aggro', 'user-1')
    expect(spy).toHaveBeenCalledWith({}, { query: 'aggro', viewerId: 'user-1', limit: 25 })
  })
})

describe('resolveDeckRef', () => {
  it('takes an id the viewer may see', async () => {
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue({ access: 'public', name: 'D' })
    expect(await resolveDeckRef({} as never, 'abc123', null))
      .toEqual({ kind: 'deck', id: 'abc123', name: 'D', access: 'public' })
  })

  it('takes a link, keyed by the id inside it', async () => {
    const spy = vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue({ access: 'own-private', name: 'D' })
    const ref = await resolveDeckRef({} as never, 'https://revelio.cards/de/decks/abc123', 'u1')
    expect(spy).toHaveBeenCalledWith({}, 'abc123', 'u1')
    expect(ref).toEqual({ kind: 'deck', id: 'abc123', name: 'D', access: 'own-private' })
  })

  it('falls back to a name search with the whole input', async () => {
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(null)
    const search = vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([suggestion({ id: 'd9', name: 'Aggro/Control' })])
    const ref = await resolveDeckRef({} as never, '  Aggro/Control ', null)
    expect(search).toHaveBeenCalledWith({}, { query: 'Aggro/Control', viewerId: null, limit: 25 })
    expect(ref).toEqual({ kind: 'deck', id: 'd9', name: 'Aggro/Control', access: 'public' })
  })

  it('picks the one exact name among several partial matches', async () => {
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(null)
    vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([
      suggestion({ id: 'a', name: 'Aggro Deluxe' }),
      suggestion({ id: 'b', name: 'aggro', visibility: 'private', isOwn: true, exactName: true }),
    ])
    expect(await resolveDeckRef({} as never, 'Aggro', 'u1'))
      .toEqual({ kind: 'deck', id: 'b', name: 'aggro', access: 'own-private' })
  })

  // The database decides what an exact name is, with the same lower() it ranks
  // by: JS toLowerCase and Postgres lower() can disagree outside ASCII, which
  // could rank one deck first and then fail to pick it.
  it('takes the exact name from the database, not from a JS comparison', async () => {
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(null)
    vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([
      suggestion({ id: 'a', name: 'ÄRGER', exactName: true }),
      suggestion({ id: 'b', name: 'Ärger Deluxe' }),
    ])
    expect(await resolveDeckRef({} as never, 'ärger', null))
      .toEqual({ kind: 'deck', id: 'a', name: 'ÄRGER', access: 'public' })
  })

  it('does not treat a JS-equal name as exact unless the database says so', async () => {
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(null)
    const options = [suggestion({ id: 'a', name: 'Aggro' }), suggestion({ id: 'b', name: 'Aggro Deluxe' })]
    vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue(options)
    expect(await resolveDeckRef({} as never, 'aggro', null)).toEqual({ kind: 'ambiguous', options })
  })

  it('reports several matches as ambiguous', async () => {
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(null)
    const options = [suggestion({ id: 'a', name: 'Aggro One' }), suggestion({ id: 'b', name: 'Aggro Two' })]
    vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue(options)
    expect(await resolveDeckRef({} as never, 'aggro', null)).toEqual({ kind: 'ambiguous', options })
  })

  it('reports no match as none', async () => {
    vi.spyOn(dbModule, 'getDeckAccess').mockResolvedValue(null)
    vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([])
    expect(await resolveDeckRef({} as never, 'nothing', null)).toEqual({ kind: 'none' })
  })

  // parseDeckRef strips from the first "/", "?" or "#", so a name that starts
  // with one parses to an empty id. It is still a name worth searching for.
  it('searches a name that parses to no id', async () => {
    const access = vi.spyOn(dbModule, 'getDeckAccess')
    vi.spyOn(dbModule, 'suggestDecks').mockResolvedValue([suggestion({ id: 'd7', name: '#1 Aggro' })])
    expect(await resolveDeckRef({} as never, '#1 Aggro', null))
      .toEqual({ kind: 'deck', id: 'd7', name: '#1 Aggro', access: 'public' })
    expect(access).not.toHaveBeenCalled()
  })

  // An empty query matches every visible deck, so a blank input reaching the
  // name search would come back as a 25-deck menu of everything.
  it('treats blank input as none without reading anything', async () => {
    const access = vi.spyOn(dbModule, 'getDeckAccess')
    const search = vi.spyOn(dbModule, 'suggestDecks')
    expect(await resolveDeckRef({} as never, '   ', null)).toEqual({ kind: 'none' })
    expect(access).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
  })
})
