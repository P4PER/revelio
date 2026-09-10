import { eq, asc, sql, inArray, and, count } from 'drizzle-orm'
import type { DB } from '../client'
import { cards, sets, collections, userCards } from '../schema'
import { user } from '../auth-schema'
import type { CollectionVisibility, OwnedQuantities, SetProgress, CollectionSummary } from '@revelio/core'
import type { Tx } from './types'

// Ensure the per-user collection row exists (holds the visibility flag).
async function ensureCollection(tx: Tx | DB, userId: string): Promise<void> {
  await tx.insert(collections).values({ userId }).onConflictDoNothing()
}

export async function setCardQuantity(
  db: DB, userId: string, cardId: string, finish: string, quantity: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    await ensureCollection(tx, userId)
    if (quantity <= 0) {
      await tx.delete(userCards).where(and(
        eq(userCards.userId, userId), eq(userCards.cardId, cardId), eq(userCards.finish, finish),
      ))
      return
    }
    await tx.insert(userCards)
      .values({ userId, cardId, finish, quantity })
      .onConflictDoUpdate({
        target: [userCards.userId, userCards.cardId, userCards.finish],
        set: { quantity },
      })
  })
}

export async function setCollectionVisibility(
  db: DB, userId: string, visibility: CollectionVisibility,
): Promise<void> {
  await db.insert(collections)
    .values({ userId, visibility })
    .onConflictDoUpdate({ target: collections.userId, set: { visibility, updatedAt: new Date() } })
}

export async function getOwnedQuantities(
  db: DB, userId: string, cardIds: string[],
): Promise<OwnedQuantities> {
  if (cardIds.length === 0) return {}
  const rows = await db.select({ cardId: userCards.cardId, finish: userCards.finish, quantity: userCards.quantity })
    .from(userCards)
    .where(and(eq(userCards.userId, userId), inArray(userCards.cardId, cardIds)))
  const out: OwnedQuantities = {}
  for (const r of rows) {
    ;(out[r.cardId] ??= {})[r.finish] = r.quantity
  }
  return out
}

export async function getCollectionVisibility(db: DB, userId: string): Promise<CollectionVisibility> {
  const [row] = await db.select({ visibility: collections.visibility })
    .from(collections).where(eq(collections.userId, userId)).limit(1)
  return (row?.visibility as CollectionVisibility) ?? 'private'
}

export async function getOwnedCardIds(db: DB, userId: string): Promise<string[]> {
  const rows = await db.selectDistinct({ cardId: userCards.cardId })
    .from(userCards).where(eq(userCards.userId, userId))
  return rows.map((r) => r.cardId)
}

export async function getDuplicateCardIds(db: DB, userId: string): Promise<string[]> {
  const rows = await db.selectDistinct({ cardId: userCards.cardId })
    .from(userCards)
    .where(and(eq(userCards.userId, userId), sql`${userCards.quantity} > 1`))
  return rows.map((r) => r.cardId)
}

export async function getCollectionSetProgress(db: DB, userId: string): Promise<SetProgress[]> {
  // For every set, count distinct owned cards (left join so empty sets show 0),
  // against the set's cardCount. `count(distinct uc.card_id)` ignores the finish
  // dimension → completion is finish-agnostic.
  const rows = await db
    .select({
      setCode: sets.code,
      total: sets.cardCount,
      owned: sql<number>`count(distinct ${userCards.cardId})`,
    })
    .from(sets)
    .leftJoin(cards, eq(cards.setCode, sets.code))
    .leftJoin(
      userCards,
      and(eq(userCards.cardId, cards.id), eq(userCards.userId, userId)),
    )
    .groupBy(sets.code, sets.cardCount, sets.releaseDate)
    .orderBy(asc(sets.releaseDate), asc(sets.code))
  return rows.map((r) => ({ setCode: r.setCode, owned: Number(r.owned), total: r.total }))
}

export async function getCollectionSummary(db: DB, userId: string): Promise<CollectionSummary> {
  const [distinct] = await db.select({ n: sql<number>`count(distinct ${userCards.cardId})` })
    .from(userCards).where(eq(userCards.userId, userId))
  const [copies] = await db.select({ n: sql<number>`coalesce(sum(${userCards.quantity}), 0)` })
    .from(userCards).where(eq(userCards.userId, userId))
  const [total] = await db.select({ n: count(cards.id) }).from(cards)
  return {
    distinctOwned: Number(distinct?.n ?? 0),
    totalCards: Number(total?.n ?? 0),
    totalCopies: Number(copies?.n ?? 0),
  }
}

export async function resolveCollectionOwner(
  db: DB, key: string,
): Promise<{ userId: string; username: string | null } | null> {
  // Prefer username (case-insensitive), fall back to a raw user id.
  const [byName] = await db.select({ userId: user.id, username: user.username })
    .from(user).where(sql`lower(${user.username}) = lower(${key})`).limit(1)
  if (byName) return { userId: byName.userId, username: byName.username }
  const [byId] = await db.select({ userId: user.id, username: user.username })
    .from(user).where(eq(user.id, key)).limit(1)
  return byId ? { userId: byId.userId, username: byId.username } : null
}
