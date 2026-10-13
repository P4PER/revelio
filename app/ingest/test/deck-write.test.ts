import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withMigratedDb } from './helpers.js'
import {
  createDeck, getDeck, listDecksByUser, pageDecksByUser, updateDeck, updateDeckMeta, deleteDeck, resolveCardsByName, getCardViews,
  user, sets, cards,
} from '@revelio/db'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

beforeAll(async () => {
  ctx = await withMigratedDb()
  // Seed a user, two sets (one official), and cards the deck/resolution tests can reference.
  await ctx.db.insert(user).values({ id: 'u1', name: 'Tester', email: 't@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
  await ctx.db.insert(sets).values([
    { code: 'BS', name: 'Base', isOfficial: true, cardCount: 3 },
    { code: 'PR', name: 'Promo', isOfficial: false, cardCount: 1 },
  ])
  await ctx.db.insert(cards).values([
    { id: 'bs-harry', setCode: 'BS', number: '1', name: 'Harry Potter', defaultLanguage: 'en' },
    { id: 'bs-accio', setCode: 'BS', number: '2', name: 'Accio', defaultLanguage: 'en' },
    // Shares a name with the promo card below to test ambiguous name resolution.
    { id: 'bs-dobby', setCode: 'BS', number: '3', name: 'Dobby', defaultLanguage: 'en' },
    { id: 'pr-dobby', setCode: 'PR', number: '1', name: 'Dobby', defaultLanguage: 'en' },
  ])
}, 120_000)

afterAll(async () => { await ctx.stop() })

describe('deck queries', () => {
  it('pages a user\'s decks in the database, in the full list\'s order', async () => {
    await ctx.db.insert(user).values({ id: 'u-paged', name: 'Pager', email: 'p@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
    for (let i = 0; i < 5; i++) {
      await createDeck(ctx.db, 'u-paged', { name: `Paged ${i}`, format: 'classic', visibility: 'private', cards: [] })
    }
    const all = (await listDecksByUser(ctx.db, 'u-paged')).map((d) => d.id)
    const second = await pageDecksByUser(ctx.db, 'u-paged', { page: 2, pageSize: 2 })
    expect(second.decks.map((d) => d.id)).toEqual(all.slice(2, 4))
    expect(second).toMatchObject({ total: 5, page: 2, pageCount: 3 })
    // A page past the end (decks deleted since the browser was drawn) shows the last one.
    const past = await pageDecksByUser(ctx.db, 'u-paged', { page: 9, pageSize: 2 })
    expect(past.decks.map((d) => d.id)).toEqual(all.slice(4))
    expect(past.page).toBe(3)
    // Exported from the shared barrel, so bad input reads as page 1 of one-deck pages.
    const odd = await pageDecksByUser(ctx.db, 'u-paged', { page: Number.NaN, pageSize: 0 })
    expect(odd).toMatchObject({ page: 1, pageCount: 5 })
    expect(odd.decks.map((d) => d.id)).toEqual(all.slice(0, 1))
    const none = await pageDecksByUser(ctx.db, 'u-nobody', { page: 1, pageSize: 2 })
    expect(none).toMatchObject({ decks: [], total: 0, page: 1, pageCount: 1 })
  })

  it('creates, reads, lists, updates and deletes a deck', async () => {
    const id = await createDeck(ctx.db, 'u1', {
      name: 'My Deck', format: 'revival', visibility: 'private',
      cards: [
        { cardId: 'bs-harry', zone: 'character', quantity: 1 },
        { cardId: 'bs-accio', zone: 'main', quantity: 4 },
      ],
    })
    expect(id).toBeTruthy()

    const got = await getDeck(ctx.db, id)
    expect(got?.userId).toBe('u1')
    expect(got?.deck.name).toBe('My Deck')
    expect(got?.deck.cards).toHaveLength(2)
    expect(got?.views.find((v) => v.cardId === 'bs-accio')?.name).toBe('Accio')
    // BS is an official set — the sets-join must surface that on the view.
    expect(got?.views.find((v) => v.cardId === 'bs-accio')?.isOfficial).toBe(true)
    // The seeded collector number is threaded through onto the view.
    expect(got?.views.find((v) => v.cardId === 'bs-accio')?.number).toBe('2')

    const list = await listDecksByUser(ctx.db, 'u1')
    expect(list).toHaveLength(1)
    expect(list[0].cardCount).toBe(5) // 1 char + 4 main
    // What the bot's /mydecks row draws, as a /decks row does.
    expect(list[0]).toMatchObject({ likeCount: 0, lessons: [], starterCardId: 'bs-harry', starterArtCropVersion: null })

    await updateDeck(ctx.db, id, {
      name: 'Renamed', format: 'classic', visibility: 'public',
      cards: [{ cardId: 'bs-harry', zone: 'character', quantity: 1 }],
    })
    const after = await getDeck(ctx.db, id)
    expect(after?.deck.name).toBe('Renamed')
    expect(after?.deck.format).toBe('classic')
    expect(after?.deck.cards).toHaveLength(1)

    await deleteDeck(ctx.db, id)
    expect(await getDeck(ctx.db, id)).toBeNull()
  })

  it('updateDeckMeta changes name/visibility without touching card rows', async () => {
    const id = await createDeck(ctx.db, 'u1', {
      name: 'Meta Deck', format: 'revival', visibility: 'private',
      cards: [
        { cardId: 'bs-harry', zone: 'character', quantity: 1 },
        { cardId: 'bs-accio', zone: 'main', quantity: 4 },
      ],
    })

    await updateDeckMeta(ctx.db, id, { name: 'Renamed Meta Deck', visibility: 'public' })
    const after = await getDeck(ctx.db, id)
    expect(after?.deck.name).toBe('Renamed Meta Deck')
    expect(after?.deck.visibility).toBe('public')
    // Card rows are untouched — same two entries, same zones/quantities.
    expect(after?.deck.cards).toHaveLength(2)
    expect(after?.deck.cards).toEqual(
      expect.arrayContaining([
        { cardId: 'bs-harry', zone: 'character', quantity: 1 },
        { cardId: 'bs-accio', zone: 'main', quantity: 4 },
      ]),
    )

    // Updating only one field leaves the other untouched.
    await updateDeckMeta(ctx.db, id, { visibility: 'private' })
    const after2 = await getDeck(ctx.db, id)
    expect(after2?.deck.name).toBe('Renamed Meta Deck')
    expect(after2?.deck.visibility).toBe('private')

    await deleteDeck(ctx.db, id)
  })

  it('resolves card names to ids, honoring the setCode/number-scoped map key', async () => {
    const out = await resolveCardsByName(ctx.db, [
      { name: 'Harry Potter', setCode: null },
      { name: 'Nimbus 9000 (does not exist)', setCode: null },
      { name: 'Dobby', setCode: null },
      { name: 'Dobby', setCode: 'PR' },
      { name: 'Harry Potter', setCode: 'BS', number: '1' },
    ])

    // Exact, unambiguous name match.
    expect(out['harry potter||']).toBe('bs-harry')
    // Missing name resolves to null.
    expect(out['nimbus 9000 (does not exist)||']).toBeNull()
    // Ambiguous match (two cards named "Dobby", no setCode given) resolves to null.
    expect(out['dobby||']).toBeNull()
    // Set-scoped lookup disambiguates to the promo printing.
    expect(out['dobby|PR|']).toBe('pr-dobby')
    // (set, number) resolves directly — the primary path for re-import, since a
    // name can have several printings in one set.
    expect(out['harry potter|BS|1']).toBe('bs-harry')
  })

  it('getCardViews returns view metadata keyed by cardId, omitting unresolvable ids', async () => {
    const out = await getCardViews(ctx.db, ['bs-harry', 'pr-dobby', 'does-not-exist'])

    expect(Object.keys(out).sort()).toEqual(['bs-harry', 'pr-dobby'])
    expect(out['bs-harry']).toMatchObject({ cardId: 'bs-harry', name: 'Harry Potter', setCode: 'BS', number: '1' })
    // BS is an official set — the sets-join must surface that on the view.
    expect(out['bs-harry'].isOfficial).toBe(true)
    // PR is not an official set.
    expect(out['pr-dobby']).toMatchObject({ cardId: 'pr-dobby', name: 'Dobby', setCode: 'PR', number: '1' })
    expect(out['pr-dobby'].isOfficial).toBe(false)
    // A nonexistent card id is simply absent, not a placeholder entry — callers
    // (deck import) rely on this to distinguish resolved from unresolved ids.
    expect(out['does-not-exist']).toBeUndefined()
  })
})
