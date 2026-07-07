import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withMigratedDb } from './helpers.js'
import {
  createDeck, getDeck, listDecksByUser, updateDeck, deleteDeck,
  user, sets, cards,
} from '@revelio/db'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

beforeAll(async () => {
  ctx = await withMigratedDb()
  // Seed a user, a set, and two cards the deck can reference.
  await ctx.db.insert(user).values({ id: 'u1', name: 'Tester', email: 't@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
  await ctx.db.insert(sets).values({ code: 'BS', name: 'Base', isOfficial: true, cardCount: 2 })
  await ctx.db.insert(cards).values([
    { id: 'bs-harry', setCode: 'BS', number: '1', name: 'Harry Potter', defaultLanguage: 'en' },
    { id: 'bs-accio', setCode: 'BS', number: '2', name: 'Accio', defaultLanguage: 'en' },
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
})
