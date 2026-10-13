import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { withMigratedDb } from './helpers.js'
import { createDeck, decks, suggestDecks, getDeckAccess, user } from '@revelio/db'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
const ids: Record<string, string> = {}

beforeAll(async () => {
  ctx = await withMigratedDb()
  const now = new Date()
  await ctx.db.insert(user).values([
    { id: 'u1', name: 'Alice', username: 'alice', displayUsername: 'Alice_HP', email: 'a@e.com', emailVerified: true, createdAt: now, updatedAt: now },
    { id: 'u2', name: 'Bob', username: 'bob', email: 'b@e.com', emailVerified: true, createdAt: now, updatedAt: now },
  ])
  const make = async (key: string, userId: string, name: string, visibility: 'public' | 'private') => {
    ids[key] = await createDeck(ctx.db, userId, { name, format: 'classic', visibility, cards: [] })
  }
  await make('alicePublic', 'u1', 'Gryffindor Aggro', 'public')
  await make('alicePrivate', 'u1', 'Secret Charms', 'private')
  await make('bobPublic', 'u2', 'Slytherin Control', 'public')
  await make('bobPrivate', 'u2', 'Bob Hidden Aggro', 'private')
  await make('bobPopular', 'u2', 'Hufflepuff Aggro', 'public')
  await ctx.db.update(decks).set({ likeCount: 9 }).where(eq(decks.id, ids.bobPopular))
}, 120_000)

afterAll(async () => { await ctx.stop() })

describe('suggestDecks', () => {
  it('returns only public decks to a null viewer', async () => {
    const rows = await suggestDecks(ctx.db, { query: '', viewerId: null })
    expect(rows.map((r) => r.id).sort())
      .toEqual([ids.alicePublic, ids.bobPublic, ids.bobPopular].sort())
    expect(rows.every((r) => !r.isOwn)).toBe(true)
  })

  it('adds the viewer\'s own private decks, and never someone else\'s', async () => {
    const rows = await suggestDecks(ctx.db, { query: '', viewerId: 'u1' })
    const got = rows.map((r) => r.id)
    expect(got).toContain(ids.alicePrivate)
    expect(got).not.toContain(ids.bobPrivate)
  })

  it('lists own decks first, then public decks by likes', async () => {
    const rows = await suggestDecks(ctx.db, { query: '', viewerId: 'u1' })
    expect(rows.slice(0, 2).every((r) => r.isOwn)).toBe(true)
    expect(rows[2].id).toBe(ids.bobPopular)
  })

  it('matches the deck name or the author, case-insensitively', async () => {
    const byName = await suggestDecks(ctx.db, { query: 'aggro', viewerId: null })
    expect(byName.map((r) => r.id).sort()).toEqual([ids.alicePublic, ids.bobPopular].sort())
    const byAuthor = await suggestDecks(ctx.db, { query: 'bob', viewerId: null })
    expect(byAuthor.map((r) => r.id).sort()).toEqual([ids.bobPublic, ids.bobPopular].sort())
  })

  it('matches only the author for an @handle', async () => {
    const rows = await suggestDecks(ctx.db, { query: '@ali', viewerId: null })
    expect(rows.map((r) => r.id)).toEqual([ids.alicePublic])
  })

  it('reports the cased display handle as the author', async () => {
    const [row] = await suggestDecks(ctx.db, { query: '@alice', viewerId: null })
    expect(row.author).toBe('Alice_HP')
  })

  // Typed free text resolves by exact name among at most 25 rows, so an exact
  // match must not be cut off by better-liked partial matches.
  it('ranks an exact name above every partial match', async () => {
    const id = await createDeck(ctx.db, 'u2', { name: 'Hufflepuff', format: 'classic', visibility: 'public', cards: [] })
    try {
      const [row] = await suggestDecks(ctx.db, { query: 'HUFFLEPUFF', viewerId: 'u1', limit: 1 })
      expect(row.id).toBe(id)
    } finally {
      await ctx.db.delete(decks).where(eq(decks.id, id))
    }
  })

  // ILIKE wildcards in what the user typed are literal characters: "%" alone
  // must not turn into "every visible deck".
  it('treats % and _ in the query as literal characters', async () => {
    expect(await suggestDecks(ctx.db, { query: '%', viewerId: null })).toEqual([])
    expect(await suggestDecks(ctx.db, { query: '_', viewerId: null })).toEqual([])
    expect(await suggestDecks(ctx.db, { query: '@%', viewerId: null })).toEqual([])
  })

  it('respects the limit', async () => {
    expect(await suggestDecks(ctx.db, { query: '', viewerId: null, limit: 2 })).toHaveLength(2)
  })
})

describe('getDeckAccess', () => {
  it('reports a public deck to anyone', async () => {
    expect(await getDeckAccess(ctx.db, ids.bobPublic, null))
      .toEqual({ access: 'public', name: 'Slytherin Control' })
  })

  it('reports the owner\'s own private deck', async () => {
    expect(await getDeckAccess(ctx.db, ids.alicePrivate, 'u1'))
      .toEqual({ access: 'own-private', name: 'Secret Charms' })
  })

  it('hides another user\'s private deck exactly like an unknown id', async () => {
    expect(await getDeckAccess(ctx.db, ids.bobPrivate, 'u1')).toBeNull()
    expect(await getDeckAccess(ctx.db, ids.bobPrivate, null)).toBeNull()
    expect(await getDeckAccess(ctx.db, 'no-such-deck', 'u1')).toBeNull()
  })
})
