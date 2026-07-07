import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withMigratedDb } from './helpers.js'
import {
  createDeck, getDeck, listDecksByUser, updateDeck, deleteDeck, resolveCardsByName,
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

    const list = await listDecksByUser(ctx.db, 'u1')
    expect(list).toHaveLength(1)
    expect(list[0].cardCount).toBe(5) // 1 char + 4 main

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

  it('resolves card names to ids, honoring the setCode-scoped map key', async () => {
    const out = await resolveCardsByName(ctx.db, [
      { name: 'Harry Potter', setCode: null },
      { name: 'Nimbus 9000 (does not exist)', setCode: null },
      { name: 'Dobby', setCode: null },
      { name: 'Dobby', setCode: 'PR' },
    ])

    // Exact, unambiguous name match.
    expect(out['harry potter|']).toBe('bs-harry')
    // Missing name resolves to null.
    expect(out['nimbus 9000 (does not exist)|']).toBeNull()
    // Ambiguous match (two cards named "Dobby", no setCode given) resolves to null.
    expect(out['dobby|']).toBeNull()
    // Set-scoped lookup disambiguates to the promo printing.
    expect(out['dobby|PR']).toBe('pr-dobby')
  })
})
