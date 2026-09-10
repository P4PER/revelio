import { eq, desc, sql, inArray, and, isNotNull } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { DB } from '../client'
import { cards, sets, cardLocalizations, cardTypes, cardSubTypes, decks, deckCards } from '../schema'
import { user } from '../auth-schema'
import type { DeckDTO, DeckCardView, DeckFormat, DeckVisibility } from '@revelio/core'
import { deckCardMeta } from '@revelio/core'
import type { Tx } from './types'

export type DeckWriteInput = {
  name: string
  format: DeckFormat
  visibility: DeckVisibility
  cards: { cardId: string; zone: string; quantity: number }[]
}

export type DeckSummary = {
  id: string; name: string; format: DeckFormat; visibility: DeckVisibility
  cardCount: number; mainCount: number; hasCharacter: boolean
  characterName: string | null; updatedAt: string
}

// Small helper: group junction rows into a code[] per parent id.
function groupCodes<T>(rows: T[], key: (r: T) => string, code: (r: T) => string): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const r of rows) { const k = key(r); const arr = m.get(k) ?? []; arr.push(code(r)); m.set(k, arr) }
  return m
}

// Shared by getDeck (view for every deck_card row, falling back to defaults
// for cards that no longer exist) and getCardViews (import: callers need to
// tell "resolved" apart from "missing" so an absent id here means "skip me").
async function cardViewMetaByIds(db: DB, ids: string[]): Promise<Map<string, Omit<DeckCardView, 'zone' | 'quantity'>>> {
  const uniqueIds = [...new Set(ids)]
  const cardRows = uniqueIds.length ? await db.select().from(cards).where(inArray(cards.id, uniqueIds)) : []
  const locRows = uniqueIds.length
    ? await db
        .select({ cardId: cardLocalizations.cardId, lang: cardLocalizations.lang, imageVersion: cardLocalizations.imageVersion })
        .from(cardLocalizations)
        .where(inArray(cardLocalizations.cardId, uniqueIds))
    : []
  // cardId -> lang -> image_version, so we can read each card's default-language thumb version.
  const imgVerByCardLang = new Map<string, Map<string, number | null>>()
  for (const l of locRows) {
    const m = imgVerByCardLang.get(l.cardId) ?? new Map<string, number | null>()
    m.set(l.lang, l.imageVersion)
    imgVerByCardLang.set(l.cardId, m)
  }
  const typeRows = uniqueIds.length ? await db.select().from(cardTypes).where(inArray(cardTypes.cardId, uniqueIds)) : []
  const subRows = uniqueIds.length ? await db.select().from(cardSubTypes).where(inArray(cardSubTypes.cardId, uniqueIds)) : []
  const setCodes = [...new Set(cardRows.map((c) => c.setCode))]
  const setRows = setCodes.length ? await db.select().from(sets).where(inArray(sets.code, setCodes)) : []
  const isOfficialBySetCode = new Map(setRows.map((s) => [s.code, s.isOfficial]))
  const typesById = groupCodes(typeRows, (r) => r.cardId, (r) => r.typeCode)
  const subsById = groupCodes(subRows, (r) => r.cardId, (r) => r.subTypeCode)

  const out = new Map<string, Omit<DeckCardView, 'zone' | 'quantity'>>()
  for (const c of cardRows) {
    const m = deckCardMeta({
      id: c.id, isOfficial: isOfficialBySetCode.get(c.setCode) ?? false, legality: c.legality ?? null,
      types: typesById.get(c.id) ?? [], subTypes: subsById.get(c.id) ?? [],
    })
    out.set(c.id, {
      cardId: c.id, name: c.name, cost: c.cost ?? null, damage: c.damagePerTurn ?? null,
      types: typesById.get(c.id) ?? [],
      setCode: c.setCode, number: c.number,
      lesson: c.lesson ?? null, isOfficial: m.isOfficial, legality: m.legality,
      isLesson: m.isLesson, isStartingCharacter: m.isStartingCharacter,
      orientation: c.orientation ?? null,
      imageVersion: imgVerByCardLang.get(c.id)?.get(c.defaultLanguage) ?? null,
      artCropVersion: c.artCropVersion ?? null,
    })
  }
  return out
}

async function replaceDeckCards(tx: Tx, id: string, cardsIn: DeckWriteInput['cards']): Promise<void> {
  await tx.delete(deckCards).where(eq(deckCards.deckId, id))
  if (cardsIn.length) {
    await tx.insert(deckCards).values(cardsIn.map((c) => ({ deckId: id, cardId: c.cardId, zone: c.zone, quantity: c.quantity })))
  }
  // Cache the deck's distinct lesson codes for the public browse filter (GIN),
  // recomputed on every save so decks.lessons is always derived from the cards.
  const cardIds = [...new Set(cardsIn.map((c) => c.cardId))]
  const lessonRows = cardIds.length
    ? await tx.selectDistinct({ lesson: cards.lesson }).from(cards)
        .where(and(inArray(cards.id, cardIds), isNotNull(cards.lesson)))
    : []
  const deckLessons = lessonRows.map((r) => r.lesson!).filter(Boolean)
  await tx.update(decks).set({ lessons: deckLessons }).where(eq(decks.id, id))
}

export async function listDecksByUser(db: DB, userId: string): Promise<DeckSummary[]> {
  const rows = await db.select().from(decks).where(eq(decks.userId, userId)).orderBy(desc(decks.updatedAt))
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  // Per-zone quantity sums, so the summary can show the main-deck count against
  // the 60 target (rather than a total that includes the starting character and
  // sideboard) plus whether a starting character is present.
  const counts = await db
    .select({ deckId: deckCards.deckId, zone: deckCards.zone, total: sql<number>`sum(${deckCards.quantity})::int` })
    .from(deckCards)
    .where(inArray(deckCards.deckId, ids))
    .groupBy(deckCards.deckId, deckCards.zone)
  const totalByDeck = new Map<string, number>()
  const mainByDeck = new Map<string, number>()
  const hasCharacter = new Set<string>()
  for (const c of counts) {
    totalByDeck.set(c.deckId, (totalByDeck.get(c.deckId) ?? 0) + c.total)
    if (c.zone === 'main') mainByDeck.set(c.deckId, c.total)
    if (c.zone === 'character' && c.total > 0) hasCharacter.add(c.deckId)
  }
  // The starting character's display name for each deck (if one is set).
  const charRows = await db
    .select({ deckId: deckCards.deckId, name: cards.name })
    .from(deckCards)
    .innerJoin(cards, eq(deckCards.cardId, cards.id))
    .where(and(inArray(deckCards.deckId, ids), eq(deckCards.zone, 'character')))
  const charByDeck = new Map(charRows.map((c) => [c.deckId, c.name]))
  return rows.map((r) => ({
    id: r.id, name: r.name, format: r.format as DeckFormat, visibility: r.visibility as DeckVisibility,
    cardCount: totalByDeck.get(r.id) ?? 0, mainCount: mainByDeck.get(r.id) ?? 0,
    hasCharacter: hasCharacter.has(r.id), characterName: charByDeck.get(r.id) ?? null,
    updatedAt: r.updatedAt.toISOString(),
  }))
}

// Updates only name/visibility (+ updatedAt) — never touches deck_cards. Used
// by list-page actions (rename, visibility toggle) where the caller only has
// a DeckSummary, not the full card list `updateDeck` requires.
export async function updateDeckMeta(
  db: DB, id: string, fields: { name?: string; visibility?: DeckVisibility },
): Promise<void> {
  const set: Partial<typeof decks.$inferInsert> = { updatedAt: new Date() }
  if (fields.name !== undefined) set.name = fields.name
  if (fields.visibility !== undefined) set.visibility = fields.visibility
  await db.update(decks).set(set).where(eq(decks.id, id))
}

// Card view metadata (name/cost/lesson/legality/…) for an arbitrary set of card
// ids, keyed by cardId. Ids with no matching card are simply absent from the
// result — callers (e.g. deck import) use that to flag/skip unresolved cards.
export async function getCardViews(db: DB, ids: string[]): Promise<Record<string, Omit<DeckCardView, 'zone' | 'quantity'>>> {
  return Object.fromEntries(await cardViewMetaByIds(db, ids))
}

export async function getDeck(db: DB, id: string): Promise<{ deck: DeckDTO; userId: string; views: DeckCardView[]; viewCount: number; ownerUsername: string | null } | null> {
  const [row] = await db.select().from(decks).where(eq(decks.id, id)).limit(1)
  if (!row) return null
  const dcs = await db.select().from(deckCards).where(eq(deckCards.deckId, id))
  const metaById = await cardViewMetaByIds(db, dcs.map((d) => d.cardId))

  const views: DeckCardView[] = dcs.map((d) => {
    const meta = metaById.get(d.cardId)
    return {
      cardId: d.cardId, zone: d.zone as DeckCardView['zone'], quantity: d.quantity,
      name: meta?.name ?? d.cardId, cost: meta?.cost ?? null, damage: meta?.damage ?? null,
      types: meta?.types ?? [],
      setCode: meta?.setCode ?? '', number: meta?.number ?? '',
      lesson: meta?.lesson ?? null, isOfficial: meta?.isOfficial ?? false, legality: meta?.legality ?? null,
      isLesson: meta?.isLesson ?? false, isStartingCharacter: meta?.isStartingCharacter ?? false,
      orientation: meta?.orientation ?? null,
      imageVersion: meta?.imageVersion ?? null,
      artCropVersion: meta?.artCropVersion ?? null,
    }
  })
  const deck: DeckDTO = {
    id: row.id, name: row.name, format: row.format as DeckFormat,
    visibility: row.visibility as DeckVisibility,
    cards: dcs.map((d) => ({ cardId: d.cardId, zone: d.zone as DeckCardView['zone'], quantity: d.quantity })),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
  const [owner] = await db
    .select({ username: user.username, displayUsername: user.displayUsername })
    .from(user)
    .where(eq(user.id, row.userId))
    .limit(1)
  const ownerUsername = owner?.displayUsername ?? owner?.username ?? null
  return { deck, userId: row.userId, views, viewCount: row.viewCount, ownerUsername }
}

// Viewer-aware read for the public overview page: the owner always sees their
// deck; everyone else (including guests, viewerId=null) only sees it when it is
// public. Returning null for a private deck a viewer can't see means the route
// 404s and can't be used to probe another user's deck IDs.
export async function getDeckForViewer(
  db: DB, id: string, viewerId: string | null,
): Promise<{ deck: DeckDTO; userId: string; views: DeckCardView[]; viewCount: number; ownerUsername: string | null } | null> {
  const res = await getDeck(db, id)
  if (!res) return null
  const isOwner = res.userId === viewerId
  if (!isOwner && res.deck.visibility !== 'public') return null
  return res
}

export async function createDeck(db: DB, userId: string, input: DeckWriteInput): Promise<string> {
  const id = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(decks).values({ id, userId, name: input.name, format: input.format, visibility: input.visibility })
    await replaceDeckCards(tx, id, input.cards)
  })
  return id
}

export async function updateDeck(db: DB, id: string, input: DeckWriteInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(decks).set({
      name: input.name, format: input.format, visibility: input.visibility, updatedAt: new Date(),
    }).where(eq(decks.id, id))
    await replaceDeckCards(tx, id, input.cards)
  })
}

export async function deleteDeck(db: DB, id: string): Promise<void> {
  await db.delete(decks).where(eq(decks.id, id))
}

export async function resolveCardsByName(
  db: DB, names: { name: string; setCode: string | null; number?: string | null }[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  for (const n of names) {
    const number = n.number ?? null
    const key = `${n.name.toLowerCase()}|${n.setCode ?? ''}|${number ?? ''}`
    if (key in out) continue
    // (set, number) is unique within a set, so prefer it when the number is
    // present — a name alone can be ambiguous (holo/foil printings share a
    // name). Fall back to name (+ set) when there's no number.
    const where = n.setCode && number
      ? and(eq(cards.setCode, n.setCode), eq(cards.number, number))
      : n.setCode
        ? and(sql`lower(${cards.name}) = ${n.name.toLowerCase()}`, eq(cards.setCode, n.setCode))
        : sql`lower(${cards.name}) = ${n.name.toLowerCase()}`
    const rows = await db.select({ id: cards.id }).from(cards).where(where).limit(2)
    out[key] = rows.length === 1 ? rows[0].id : null // ambiguous (>1) or missing (0) → null
  }
  return out
}
