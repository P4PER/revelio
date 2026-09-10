import { eq, asc, inArray } from 'drizzle-orm'
import type { DB } from '../client'
import { decks, deckCards, deckLikes, collections, userCards } from '../schema'
import { user, account } from '../auth-schema'

export type UserExport = {
  profile: { username: string | null; displayUsername: string | null; email: string; role: string | null; createdAt: string }
  decks: Array<{ id: string; name: string; format: string; visibility: string; lessons: string[]; cards: Array<{ cardId: string; zone: string; quantity: number }> }>
  collection: { visibility: string; ownedCards: Array<{ cardId: string; finish: string; quantity: number }> }
  likes: Array<{ deckId: string; createdAt: string }>
  // The privacy policy documents the stored Discord user id as personal data,
  // so the export has to carry it. Tokens are deliberately left out: they are
  // credentials for reaching Discord, not information about the user.
  connections: Array<{ provider: string; accountId: string; linkedAt: string }>
}

/** Aggregate everything a user owns into one serialisable object (for data export). */
export async function getUserExport(db: DB, userId: string): Promise<UserExport> {
  const [u] = await db
    .select({
      username: user.username, displayUsername: user.displayUsername,
      email: user.email, role: user.role, createdAt: user.createdAt,
    })
    .from(user).where(eq(user.id, userId)).limit(1)
  if (!u) throw new Error('user not found')

  const deckRows = await db
    .select({ id: decks.id, name: decks.name, format: decks.format, visibility: decks.visibility, lessons: decks.lessons })
    .from(decks).where(eq(decks.userId, userId)).orderBy(asc(decks.name))
  const deckIds = deckRows.map((d) => d.id)
  const cardRows = deckIds.length
    ? await db.select({ deckId: deckCards.deckId, cardId: deckCards.cardId, zone: deckCards.zone, quantity: deckCards.quantity })
        .from(deckCards).where(inArray(deckCards.deckId, deckIds))
    : []
  const cardsByDeck = new Map<string, Array<{ cardId: string; zone: string; quantity: number }>>()
  for (const c of cardRows) {
    const list = cardsByDeck.get(c.deckId) ?? []
    list.push({ cardId: c.cardId, zone: c.zone, quantity: c.quantity })
    cardsByDeck.set(c.deckId, list)
  }

  const [coll] = await db.select({ visibility: collections.visibility })
    .from(collections).where(eq(collections.userId, userId)).limit(1)
  const owned = await db.select({ cardId: userCards.cardId, finish: userCards.finish, quantity: userCards.quantity })
    .from(userCards).where(eq(userCards.userId, userId)).orderBy(asc(userCards.cardId))
  const likeRows = await db.select({ deckId: deckLikes.deckId, createdAt: deckLikes.createdAt })
    .from(deckLikes).where(eq(deckLikes.userId, userId))
  const linkRows = await db
    .select({ provider: account.providerId, accountId: account.accountId, linkedAt: account.createdAt })
    .from(account).where(eq(account.userId, userId)).orderBy(asc(account.providerId))

  return {
    profile: {
      username: u.username, displayUsername: u.displayUsername, email: u.email,
      role: u.role, createdAt: u.createdAt.toISOString(),
    },
    decks: deckRows.map((d) => ({ ...d, cards: cardsByDeck.get(d.id) ?? [] })),
    collection: { visibility: coll?.visibility ?? 'private', ownedCards: owned },
    likes: likeRows.map((l) => ({ deckId: l.deckId, createdAt: l.createdAt.toISOString() })),
    connections: linkRows.map((l) => ({
      provider: l.provider, accountId: l.accountId, linkedAt: l.linkedAt.toISOString(),
    })),
  }
}
