import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withMigratedDb } from './helpers.js'
import { createDeck, getDeckForViewer, updateDeckMeta, user, sets, cards } from '@revelio/db'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
let deckId: string

beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(user).values([
    { id: 'owner', name: 'Owner', email: 'o@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 'other', name: 'Other', email: 'x@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
  ])
  await ctx.db.insert(sets).values([{ code: 'BS', name: 'Base', isOfficial: true, cardCount: 1 }])
  await ctx.db.insert(cards).values([{ id: 'bs-harry', setCode: 'BS', number: '1', name: 'Harry Potter', defaultLanguage: 'en' }])
  deckId = await createDeck(ctx.db, 'owner', {
    name: 'Private Deck', format: 'revival', visibility: 'private',
    cards: [{ cardId: 'bs-harry', zone: 'character', quantity: 1 }],
  })
}, 120_000)

afterAll(async () => { await ctx.stop() })

describe('getDeckForViewer', () => {
  it('returns the deck to its owner even when private', async () => {
    const res = await getDeckForViewer(ctx.db, deckId, 'owner')
    expect(res?.deck.name).toBe('Private Deck')
  })

  it('hides a private deck from a non-owner', async () => {
    expect(await getDeckForViewer(ctx.db, deckId, 'other')).toBeNull()
  })

  it('hides a private deck from a guest (null viewer)', async () => {
    expect(await getDeckForViewer(ctx.db, deckId, null)).toBeNull()
  })

  it('shows a public deck to a non-owner and a guest', async () => {
    await updateDeckMeta(ctx.db, deckId, { visibility: 'public' })
    expect((await getDeckForViewer(ctx.db, deckId, 'other'))?.deck.visibility).toBe('public')
    expect((await getDeckForViewer(ctx.db, deckId, null))?.deck.name).toBe('Private Deck')
  })

  it('returns null for a missing id', async () => {
    expect(await getDeckForViewer(ctx.db, 'nope', 'owner')).toBeNull()
  })
})
