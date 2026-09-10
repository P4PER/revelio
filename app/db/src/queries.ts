import { eq, ne, asc, desc, sql, inArray, and, or, isNull, isNotNull, ilike, count, arrayOverlaps } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { randomUUID } from 'node:crypto'
import type { DB } from './client'
import { cards, sets, cardLocalizations, cardTypes, cardSubTypes, cardRulings, cardRulingLocalizations, subTypes, subTypeLocalizations, setLocalizations, decks, deckCards, deckLikes, deckViews, collections, userCards, siteSettings } from './schema'
import { user, account, session } from './auth-schema'
import type { SetDTO, CardLocalizationDTO, CardDetailDTO, RulingDTO, CardRulingsDTO, AdventureData, MatchData, DeckDTO, DeckCardView, DeckFormat, DeckVisibility, CollectionVisibility, OwnedQuantities, SetProgress, CollectionSummary } from '@revelio/core'
import { deckCardMeta } from '@revelio/core'
import type { CardIndexData } from '@revelio/search'
import type { Tx, SitemapEntry } from './queries/types'

export * from './queries/types'
export * from './queries/sets'
export * from './queries/cards'
export * from './queries/localizations'
export * from './queries/rulings'
export * from './queries/sub-types'
export * from './queries/decks'
export * from './queries/deck-browse'

export type UnlinkedAccount = { accessToken: string | null; refreshToken: string | null }

export type UserAdminRow = {
  id: string
  email: string
  emailVerified: boolean
  image: string | null
  username: string | null
  displayUsername: string | null
  role: string
  banned: boolean
  createdAt: Date
}

export type UserAdminDetail = UserAdminRow & {
  banReason: string | null
  banExpires: Date | null
}

export async function listUsersForAdmin(db: DB): Promise<UserAdminRow[]> {
  const rows = await db.select().from(user).orderBy(desc(user.createdAt))
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    emailVerified: r.emailVerified,
    image: r.image,
    username: r.username,
    displayUsername: r.displayUsername,
    role: r.role ?? 'user',
    banned: r.banned ?? false,
    createdAt: r.createdAt,
  }))
}

export async function getUserForAdmin(db: DB, id: string): Promise<UserAdminDetail | null> {
  const [r] = await db.select().from(user).where(eq(user.id, id)).limit(1)
  if (!r) return null
  return {
    id: r.id,
    email: r.email,
    emailVerified: r.emailVerified,
    image: r.image,
    username: r.username,
    displayUsername: r.displayUsername,
    role: r.role ?? 'user',
    banned: r.banned ?? false,
    createdAt: r.createdAt,
    banReason: r.banReason,
    banExpires: r.banExpires,
  }
}

export async function countAdmins(db: DB): Promise<number> {
  const [row] = await db.select({ n: count() }).from(user).where(eq(user.role, 'admin'))
  return Number(row?.n ?? 0)
}

export async function countUserDecks(db: DB, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(decks).where(eq(decks.userId, userId))
  return Number(row?.n ?? 0)
}

export async function updateUserRole(db: DB, id: string, role: string): Promise<void> {
  await db.update(user).set({ role }).where(eq(user.id, id))
}

// Deletes the banned user's sessions alongside the flag write. Better Auth's
// admin plugin only reads `banned` in its session.create.before hook, i.e. on
// the sign-in path, so without this a user banned mid-session keeps browsing
// until their session row expires. Its own /admin/ban-user route pairs the two
// the same way; this writes the flags directly, so it owns the pairing. One
// transaction, so a ban can never land with live sessions left behind.
export async function setUserBan(
  db: DB, id: string, reason: string | null, expires: Date | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(user)
      .set({ banned: true, banReason: reason, banExpires: expires })
      .where(eq(user.id, id))
    await tx.delete(session).where(eq(session.userId, id))
  })
}

export async function clearUserBan(db: DB, id: string): Promise<void> {
  await db.update(user)
    .set({ banned: false, banReason: null, banExpires: null })
    .where(eq(user.id, id))
}

export async function deleteUserById(db: DB, id: string): Promise<void> {
  await db.delete(user).where(eq(user.id, id))
}

// --- collection: write path ---

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

// --- collection: read path ---

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

// Better Auth writes one `account` row per linked provider, so the Discord
// snowflake to Revelio user mapping needs no table of our own. The bot reads
// this to turn an interaction's user id into an account it can answer for.
export async function getUserIdByDiscordAccount(
  db: DB, discordUserId: string,
): Promise<string | null> {
  // providerId is part of the predicate on purpose: accountId is only unique
  // within a provider, so a matching id under another provider is a different
  // person.
  //
  // The join is what enforces a ban in Discord: banning deletes the user's web
  // sessions but leaves the account row alone, so without this the bot would
  // keep answering a banned user indefinitely. A ban with banExpires in the
  // past has lapsed and does not count.
  const [row] = await db
    .select({ userId: account.userId })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(and(
      eq(account.providerId, 'discord'),
      eq(account.accountId, discordUserId),
      or(
        eq(user.banned, false),
        isNull(user.banned),
        and(isNotNull(user.banExpires), sql`${user.banExpires} <= now()`),
      ),
    ))
    .limit(1)
  return row?.userId ?? null
}

export async function getLinkedProviderIds(db: DB, userId: string): Promise<string[]> {
  const rows = await db
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, userId))
  return rows.map((r) => r.providerId)
}

// Deliberately not Better Auth's POST /unlink-account. That endpoint sits behind
// its fresh-session middleware, which measures age from session.createdAt, so a
// session in daily use is permanently past freshAge after a day and unlinking
// answers 403 forever. Rather than switch that control off globally for one
// low-risk operation - unlinking grants nothing and re-linking costs a full
// OAuth round-trip - we own this one deletion and leave every Better Auth
// default alone. The caller must resolve userId from the session, never trust it
// from a client.
// Returns the tokens it deleted so the caller can revoke them at the provider:
// dropping the row only ends our half of the link, and an unrevoked token stays
// valid until it expires.
export async function unlinkProvider(
  db: DB, userId: string, providerId: string,
): Promise<UnlinkedAccount[]> {
  return db
    .delete(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
    .returning({ accessToken: account.accessToken, refreshToken: account.refreshToken })
}

const SITE_SETTINGS_ID = 'singleton'

export type SiteSettings = typeof siteSettings.$inferSelect
export type SiteSettingsInput = {
  operatorName: string | null
  operatorAddress: string | null
  contactEmail: string | null
  hostingProvider: string | null
  responsiblePerson: string | null
  githubUrl: string | null
}

export async function getSiteSettings(db: DB): Promise<SiteSettings | null> {
  const rows = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.id, SITE_SETTINGS_ID))
    .limit(1)
  return rows[0] ?? null
}

export async function upsertSiteSettings(db: DB, values: SiteSettingsInput): Promise<void> {
  await db
    .insert(siteSettings)
    .values({ id: SITE_SETTINGS_ID, ...values, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: siteSettings.id,
      set: { ...values, updatedAt: new Date() },
    })
}
