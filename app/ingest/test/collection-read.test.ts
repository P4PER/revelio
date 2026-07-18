import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withMigratedDb } from './helpers.js'
import {
  setCardQuantity, getOwnedCardIds, getDuplicateCardIds, getCollectionSetProgress,
  getCollectionSummary, resolveCollectionOwner,
  user, sets, cards,
} from '@revelio/db'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(user).values({ id: 'u1', name: 'Ann', username: 'ann', email: 'a@e.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
  await ctx.db.insert(sets).values([
    { code: 'BS', name: 'Base', isOfficial: true, cardCount: 3 },
    { code: 'PR', name: 'Promo', isOfficial: false, cardCount: 1 },
  ])
  await ctx.db.insert(cards).values([
    { id: 'bs-1', setCode: 'BS', number: '1', name: 'A', defaultLanguage: 'en', finishes: ['normal', 'holo'] },
    { id: 'bs-2', setCode: 'BS', number: '2', name: 'B', defaultLanguage: 'en', finishes: ['normal'] },
    { id: 'bs-3', setCode: 'BS', number: '3', name: 'C', defaultLanguage: 'en', finishes: ['normal'] },
    { id: 'pr-1', setCode: 'PR', number: '1', name: 'D', defaultLanguage: 'en', finishes: ['normal'] },
  ])
  await setCardQuantity(ctx.db, 'u1', 'bs-1', 'normal', 3) // duplicate (>1)
  await setCardQuantity(ctx.db, 'u1', 'bs-1', 'holo', 1)
  await setCardQuantity(ctx.db, 'u1', 'bs-2', 'normal', 1)
}, 120_000)

afterAll(async () => { await ctx.stop() })

describe('collection read queries', () => {
  it('lists distinct owned card ids', async () => {
    expect((await getOwnedCardIds(ctx.db, 'u1')).sort()).toEqual(['bs-1', 'bs-2'])
  })

  it('lists cards with a duplicate finish', async () => {
    expect(await getDuplicateCardIds(ctx.db, 'u1')).toEqual(['bs-1'])
  })

  it('computes per-set completion (distinct owned / cardCount)', async () => {
    const p = await getCollectionSetProgress(ctx.db, 'u1')
    expect(p.find((s) => s.setCode === 'BS')).toEqual({ setCode: 'BS', owned: 2, total: 3 })
    expect(p.find((s) => s.setCode === 'PR')).toEqual({ setCode: 'PR', owned: 0, total: 1 })
  })

  it('summarises distinct owned, total cards, and physical copies', async () => {
    const s = await getCollectionSummary(ctx.db, 'u1')
    expect(s).toEqual({ distinctOwned: 2, totalCards: 4, totalCopies: 5 }) // 3 + 1 + 1
  })

  it('resolves an owner by username, case-insensitively, else null', async () => {
    expect(await resolveCollectionOwner(ctx.db, 'ann')).toEqual({ userId: 'u1', username: 'ann' })
    expect(await resolveCollectionOwner(ctx.db, 'ANN')).toEqual({ userId: 'u1', username: 'ann' })
    expect(await resolveCollectionOwner(ctx.db, 'ghost')).toBeNull()
  })
})
