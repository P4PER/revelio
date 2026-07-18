import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withMigratedDb } from './helpers.js'
import {
  setCardQuantity, setCollectionVisibility, getCardFinishes,
  getOwnedQuantities, getCollectionVisibility,
  user, sets, cards,
} from '@revelio/db'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(user).values({ id: 'u1', name: 'T', email: 't@e.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
  await ctx.db.insert(sets).values([{ code: 'BS', name: 'Base', isOfficial: true, cardCount: 2 }])
  await ctx.db.insert(cards).values([
    { id: 'bs-harry', setCode: 'BS', number: '1', name: 'Harry', defaultLanguage: 'en', finishes: ['normal', 'holo'] },
    { id: 'bs-accio', setCode: 'BS', number: '2', name: 'Accio', defaultLanguage: 'en', finishes: ['normal'] },
  ])
}, 120_000)

afterAll(async () => { await ctx.stop() })

describe('collection write queries', () => {
  it('upserts a quantity and reads it back', async () => {
    await setCardQuantity(ctx.db, 'u1', 'bs-harry', 'normal', 2)
    await setCardQuantity(ctx.db, 'u1', 'bs-harry', 'holo', 1)
    const q = await getOwnedQuantities(ctx.db, 'u1', ['bs-harry', 'bs-accio'])
    expect(q['bs-harry']).toEqual({ normal: 2, holo: 1 })
    expect(q['bs-accio']).toBeUndefined()
  })

  it('overwrites an existing quantity', async () => {
    await setCardQuantity(ctx.db, 'u1', 'bs-harry', 'normal', 5)
    const q = await getOwnedQuantities(ctx.db, 'u1', ['bs-harry'])
    expect(q['bs-harry'].normal).toBe(5)
  })

  it('deletes the row when quantity drops to zero', async () => {
    await setCardQuantity(ctx.db, 'u1', 'bs-harry', 'holo', 0)
    const q = await getOwnedQuantities(ctx.db, 'u1', ['bs-harry'])
    expect(q['bs-harry'].holo).toBeUndefined()
    expect(q['bs-harry'].normal).toBe(5)
  })

  it('lazily creates the collection row and toggles visibility', async () => {
    expect(await getCollectionVisibility(ctx.db, 'u1')).toBe('private')
    await setCollectionVisibility(ctx.db, 'u1', 'public')
    expect(await getCollectionVisibility(ctx.db, 'u1')).toBe('public')
  })

  it('returns a card finishes array, or null for a missing card', async () => {
    expect(await getCardFinishes(ctx.db, 'bs-harry')).toEqual(['normal', 'holo'])
    expect(await getCardFinishes(ctx.db, 'nope')).toBeNull()
  })
})
