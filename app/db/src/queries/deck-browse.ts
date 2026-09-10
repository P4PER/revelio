import { eq, desc, sql, inArray, and, or, ilike, count, arrayOverlaps } from 'drizzle-orm'
import type { DB } from '../client'
import { cards, decks, deckCards, deckLikes, deckViews } from '../schema'
import { user } from '../auth-schema'
import type { DeckFormat } from '@revelio/core'

export type PublicDeckSort = 'likes' | 'views' | 'newest' | 'updated'

export type PublicDeckEntry = {
  id: string; name: string; format: DeckFormat; author: string
  lessons: string[]; likeCount: number; viewCount: number
  cardCount: number; updatedAt: string; likedByViewer: boolean
  starterCardId: string | null
  starterArtCropVersion: number | null
}

export type ListPublicDecksInput = {
  search?: string; lessons?: string[]; format?: DeckFormat | null
  sort?: PublicDeckSort; page?: number; viewerId?: string | null
}

const PUBLIC_PAGE_SIZE = 24

export async function toggleLike(db: DB, deckId: string, userId: string): Promise<{ liked: boolean; likeCount: number }> {
  return db.transaction(async (tx) => {
    const existing = await tx.select({ deckId: deckLikes.deckId }).from(deckLikes)
      .where(and(eq(deckLikes.deckId, deckId), eq(deckLikes.userId, userId))).limit(1)
    let liked: boolean
    if (existing.length) {
      await tx.delete(deckLikes).where(and(eq(deckLikes.deckId, deckId), eq(deckLikes.userId, userId)))
      await tx.update(decks).set({ likeCount: sql`${decks.likeCount} - 1` }).where(eq(decks.id, deckId))
      liked = false
    } else {
      await tx.insert(deckLikes).values({ deckId, userId })
      await tx.update(decks).set({ likeCount: sql`${decks.likeCount} + 1` }).where(eq(decks.id, deckId))
      liked = true
    }
    const [row] = await tx.select({ likeCount: decks.likeCount }).from(decks).where(eq(decks.id, deckId)).limit(1)
    return { liked, likeCount: row?.likeCount ?? 0 }
  })
}

export async function getDeckLikeState(db: DB, deckId: string, viewerId: string | null): Promise<{ likeCount: number; liked: boolean }> {
  const [row] = await db.select({ likeCount: decks.likeCount }).from(decks).where(eq(decks.id, deckId)).limit(1)
  const likeCount = row?.likeCount ?? 0
  if (!viewerId) return { likeCount, liked: false }
  const [mine] = await db.select({ deckId: deckLikes.deckId }).from(deckLikes)
    .where(and(eq(deckLikes.deckId, deckId), eq(deckLikes.userId, viewerId))).limit(1)
  return { likeCount, liked: Boolean(mine) }
}

export async function recordView(db: DB, deckId: string, userId: string): Promise<{ viewCount: number }> {
  return db.transaction(async (tx) => {
    const inserted = await tx.insert(deckViews).values({ deckId, userId })
      .onConflictDoNothing().returning({ deckId: deckViews.deckId })
    if (inserted.length) {
      await tx.update(decks).set({ viewCount: sql`${decks.viewCount} + 1` }).where(eq(decks.id, deckId))
    }
    const [row] = await tx.select({ viewCount: decks.viewCount }).from(decks).where(eq(decks.id, deckId)).limit(1)
    return { viewCount: row?.viewCount ?? 0 }
  })
}

export async function listPublicDecks(db: DB, input: ListPublicDecksInput): Promise<{
  entries: PublicDeckEntry[]; total: number; page: number; pageCount: number; pageSize: number
}> {
  const page = input.page && input.page >= 1 ? Math.floor(input.page) : 1
  const conds = [eq(decks.visibility, 'public')]

  const search = input.search?.trim()
  if (search) {
    if (search.startsWith('@')) {
      const handle = `%${search.slice(1)}%`
      conds.push(ilike(user.username, handle))
    } else {
      const q = `%${search}%`
      conds.push(or(ilike(decks.name, q), ilike(user.username, q))!)
    }
  }
  if (input.lessons?.length) conds.push(arrayOverlaps(decks.lessons, input.lessons))
  if (input.format) conds.push(eq(decks.format, input.format))
  const where = and(...conds)

  const [{ total }] = await db.select({ total: count() }).from(decks)
    .innerJoin(user, eq(user.id, decks.userId)).where(where)
  const pageCount = Math.max(1, Math.ceil(total / PUBLIC_PAGE_SIZE))

  const order =
    input.sort === 'views' ? [desc(decks.viewCount), desc(decks.createdAt)]
    : input.sort === 'newest' ? [desc(decks.createdAt)]
    : input.sort === 'updated' ? [desc(decks.updatedAt)]
    : [desc(decks.likeCount), desc(decks.createdAt)] // default: likes

  const viewerId = input.viewerId
  const rows = await db.select({
    id: decks.id, name: decks.name, format: decks.format,
    lessons: decks.lessons, likeCount: decks.likeCount, viewCount: decks.viewCount,
    updatedAt: decks.updatedAt,
    displayUsername: user.displayUsername, username: user.username, displayName: user.name,
    likedByViewer: viewerId
      ? sql<boolean>`EXISTS (SELECT 1 FROM ${deckLikes} WHERE ${deckLikes.deckId} = ${decks.id} AND ${deckLikes.userId} = ${viewerId})`
      : sql<boolean>`false`,
  }).from(decks).innerJoin(user, eq(user.id, decks.userId))
    .where(where).orderBy(...order)
    .limit(PUBLIC_PAGE_SIZE).offset((page - 1) * PUBLIC_PAGE_SIZE)

  const ids = rows.map((r) => r.id)
  const counts = ids.length
    ? await db.select({ deckId: deckCards.deckId, total: sql<number>`sum(${deckCards.quantity})::int` })
        .from(deckCards).where(inArray(deckCards.deckId, ids)).groupBy(deckCards.deckId)
    : []
  const byDeck = new Map(counts.map((c) => [c.deckId, c.total]))

  const starters = ids.length
    ? await db.select({ deckId: deckCards.deckId, cardId: deckCards.cardId, artCropVersion: cards.artCropVersion })
        .from(deckCards)
        .innerJoin(cards, eq(deckCards.cardId, cards.id))
        .where(and(inArray(deckCards.deckId, ids), eq(deckCards.zone, 'character')))
    : []
  const starterByDeck = new Map(starters.map((s) => [s.deckId, s.cardId]))
  const starterCropByDeck = new Map(starters.map((s) => [s.deckId, s.artCropVersion]))

  const entries: PublicDeckEntry[] = rows.map((r) => ({
    id: r.id, name: r.name, format: r.format as DeckFormat,
    // Prefer the cased display handle; fall back to the lowercase login
    // username, then the account name.
    author: r.displayUsername ?? r.username ?? r.displayName ?? '—',
    lessons: r.lessons, likeCount: r.likeCount, viewCount: r.viewCount,
    cardCount: byDeck.get(r.id) ?? 0, updatedAt: r.updatedAt.toISOString(),
    likedByViewer: Boolean(r.likedByViewer),
    starterCardId: starterByDeck.get(r.id) ?? null,
    starterArtCropVersion: starterCropByDeck.get(r.id) ?? null,
  }))
  return { entries, total, page, pageCount, pageSize: PUBLIC_PAGE_SIZE }
}
