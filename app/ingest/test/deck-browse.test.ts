import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withMigratedDb } from './helpers.js'
import { eq } from 'drizzle-orm'
import { createDeck, updateDeck, toggleLike, recordView, listPublicDecks, decks, user, sets, cards, lessons } from '@revelio/db'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(user).values([
    { id: 'u1', name: 'Alice', username: 'alice', displayUsername: 'Alice_HP', email: 'a@e.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
    { id: 'u2', name: 'Bob', username: 'bob', email: 'b@e.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
  ])
  await ctx.db.insert(lessons).values([{ code: 'charms' }, { code: 'potions' }])
  await ctx.db.insert(sets).values([{ code: 'BS', name: 'Base', isOfficial: true, cardCount: 3 }])
  await ctx.db.insert(cards).values([
    { id: 'c-charms', setCode: 'BS', number: '1', name: 'Charm Card', defaultLanguage: 'en', lesson: 'charms' },
    { id: 'c-potions', setCode: 'BS', number: '2', name: 'Potion Card', defaultLanguage: 'en', lesson: 'potions' },
    { id: 'c-nolesson', setCode: 'BS', number: '3', name: 'Neutral', defaultLanguage: 'en', lesson: null },
  ])
}, 120_000)

afterAll(async () => { await ctx.stop() })

describe('decks.lessons maintenance', () => {
  it('computes distinct non-null lesson codes on create', async () => {
    const id = await createDeck(ctx.db, 'u1', {
      name: 'D', format: 'revival', visibility: 'public',
      cards: [
        { cardId: 'c-charms', zone: 'main', quantity: 2 },
        { cardId: 'c-potions', zone: 'main', quantity: 1 },
        { cardId: 'c-nolesson', zone: 'character', quantity: 1 },
      ],
    })
    const [row] = await ctx.db.select({ lessons: decks.lessons }).from(decks).where(eq(decks.id, id))
    expect([...row.lessons].sort()).toEqual(['charms', 'potions'])
  })

  it('recomputes lessons on update', async () => {
    const id = await createDeck(ctx.db, 'u1', {
      name: 'D2', format: 'revival', visibility: 'public',
      cards: [{ cardId: 'c-charms', zone: 'main', quantity: 1 }],
    })
    await updateDeck(ctx.db, id, {
      name: 'D2', format: 'revival', visibility: 'public',
      cards: [{ cardId: 'c-potions', zone: 'main', quantity: 1 }],
    })
    const [row] = await ctx.db.select({ lessons: decks.lessons }).from(decks).where(eq(decks.id, id))
    expect(row.lessons).toEqual(['potions'])
  })
})

describe('toggleLike', () => {
  it('inserts a like and increments the counter, toggling off on repeat', async () => {
    const id = await createDeck(ctx.db, 'u1', {
      name: 'L', format: 'revival', visibility: 'public',
      cards: [{ cardId: 'c-charms', zone: 'main', quantity: 1 }],
    })
    const on = await toggleLike(ctx.db, id, 'u2')
    expect(on).toEqual({ liked: true, likeCount: 1 })

    const off = await toggleLike(ctx.db, id, 'u2')
    expect(off).toEqual({ liked: false, likeCount: 0 })
  })

  it('counts distinct users independently', async () => {
    const id = await createDeck(ctx.db, 'u1', {
      name: 'L2', format: 'revival', visibility: 'public',
      cards: [{ cardId: 'c-charms', zone: 'main', quantity: 1 }],
    })
    await toggleLike(ctx.db, id, 'u1')
    const second = await toggleLike(ctx.db, id, 'u2')
    expect(second).toEqual({ liked: true, likeCount: 2 })
  })
})

describe('recordView', () => {
  it('increments once per user and dedupes repeats', async () => {
    const id = await createDeck(ctx.db, 'u1', {
      name: 'V', format: 'revival', visibility: 'public',
      cards: [{ cardId: 'c-charms', zone: 'main', quantity: 1 }],
    })
    expect(await recordView(ctx.db, id, 'u2')).toEqual({ viewCount: 1 })
    expect(await recordView(ctx.db, id, 'u2')).toEqual({ viewCount: 1 }) // dedupe
    expect(await recordView(ctx.db, id, 'u1')).toEqual({ viewCount: 2 }) // distinct user
  })
})

describe('listPublicDecks', () => {
  it('returns only public decks with author, counts, lessons, and liked flag', async () => {
    const pub = await createDeck(ctx.db, 'u1', {
      name: 'Charms Aggro', format: 'revival', visibility: 'public',
      cards: [{ cardId: 'c-charms', zone: 'main', quantity: 1 }],
    })
    await createDeck(ctx.db, 'u1', {
      name: 'Secret', format: 'revival', visibility: 'private',
      cards: [{ cardId: 'c-potions', zone: 'main', quantity: 1 }],
    })
    await toggleLike(ctx.db, pub, 'u2')

    const res = await listPublicDecks(ctx.db, { viewerId: 'u2' })
    const found = res.entries.find((e) => e.id === pub)!
    expect(found.author).toBe('Alice_HP') // cased displayUsername, not lowercase login handle
    expect(found.lessons).toEqual(['charms'])
    expect(found.likeCount).toBe(1)
    expect(found.likedByViewer).toBe(true)
    expect(res.entries.some((e) => e.name === 'Secret')).toBe(false)
  })

  it('filters by lesson (array overlap) and by author search (@handle)', async () => {
    const byLesson = await listPublicDecks(ctx.db, { lessons: ['charms'] })
    expect(byLesson.entries.every((e) => e.lessons.includes('charms'))).toBe(true)

    // Search still matches on the lowercase login handle, but the displayed
    // author is the cased displayUsername.
    const byAuthor = await listPublicDecks(ctx.db, { search: '@alice' })
    expect(byAuthor.entries.every((e) => e.author === 'Alice_HP')).toBe(true)
    expect(byAuthor.total).toBeGreaterThan(0)
  })

  it('paginates with a stable page count', async () => {
    const res = await listPublicDecks(ctx.db, { page: 1 })
    expect(res.page).toBe(1)
    expect(res.pageCount).toBe(Math.max(1, Math.ceil(res.total / 24)))
    expect(res.entries.length).toBeLessThanOrEqual(24)
  })
})
