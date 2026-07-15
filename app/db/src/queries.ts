import { eq, asc, desc, sql, inArray, and, or, isNotNull, ilike, count, arrayOverlaps } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { DB } from './client'
import { cards, sets, cardLocalizations, cardTypes, cardSubTypes, cardRulings, cardRulingLocalizations, subTypes, subTypeLocalizations, setLocalizations, decks, deckCards, deckLikes, deckViews } from './schema'
import { user } from './auth-schema'
import type { SetDTO, CardLocalizationDTO, CardDetailDTO, AdventureData, MatchData, DeckDTO, DeckCardView, DeckFormat, DeckVisibility } from '@revelio/core'
import { deckCardMeta } from '@revelio/core'
import type { CardIndexData } from '@revelio/search'

type SetRow = typeof sets.$inferSelect

// The transaction handle drizzle passes into `db.transaction(async (tx) => ...)`.
type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]

function toSetDTO(row: SetRow, name: string = row.name): SetDTO {
  return {
    code: row.code,
    name,
    releaseDate: row.releaseDate,
    isOfficial: row.isOfficial,
    cardCount: row.cardCount,
    symbol: row.symbol,
  }
}

export async function listSets(db: DB, locale?: string): Promise<SetDTO[]> {
  const rows = await db.select().from(sets).orderBy(asc(sets.releaseDate), asc(sets.code))
  if (!locale) return rows.map((r) => toSetDTO(r))
  const locs = await db.select().from(setLocalizations).where(eq(setLocalizations.lang, locale))
  const nameByCode = new Map(locs.map((l) => [l.setCode, l.name]))
  return rows.map((r) => toSetDTO(r, nameByCode.get(r.code) ?? r.name))
}

export async function getSetByCode(db: DB, code: string, locale?: string): Promise<SetDTO | null> {
  // Set codes are stored uppercase; match case-insensitively so lowercase URL
  // codes (e.g. /sets/bs) resolve rather than 404.
  const [row] = await db.select().from(sets).where(sql`upper(${sets.code}) = upper(${code})`).limit(1)
  if (!row) return null
  if (!locale) return toSetDTO(row)
  const [loc] = await db
    .select()
    .from(setLocalizations)
    .where(and(eq(setLocalizations.setCode, row.code), eq(setLocalizations.lang, locale)))
    .limit(1)
  return toSetDTO(row, loc?.name ?? row.name)
}

export type SetForEdit = {
  code: string
  name: string
  releaseDate: string | null
  isOfficial: boolean
  cardCount: number
  symbol: string | null
  localizations: Record<string, string>
}

export async function getSetForEdit(db: DB, code: string): Promise<SetForEdit | null> {
  const [row] = await db.select().from(sets).where(eq(sets.code, code)).limit(1)
  if (!row) return null
  const locs = await db.select().from(setLocalizations).where(eq(setLocalizations.setCode, code))
  return {
    code: row.code,
    name: row.name,
    releaseDate: row.releaseDate,
    isOfficial: row.isOfficial,
    cardCount: row.cardCount,
    symbol: row.symbol,
    localizations: Object.fromEntries(locs.map((l) => [l.lang, l.name])),
  }
}

export type SetWriteInput = {
  name: string
  releaseDate: string | null
  isOfficial: boolean
  localizations: Record<string, string>
}

export async function createSet(db: DB, code: string, input: SetWriteInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(sets).values({
      code,
      name: input.name,
      releaseDate: input.releaseDate,
      isOfficial: input.isOfficial,
      origin: 'user',
    })
    const rows = Object.entries(input.localizations)
      .filter(([, name]) => name.trim() !== '')
      .map(([lang, name]) => ({ setCode: code, lang, name }))
    if (rows.length) await tx.insert(setLocalizations).values(rows)
  })
}

export async function updateSet(db: DB, code: string, input: SetWriteInput): Promise<void> {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(sets)
      .set({
        name: input.name,
        releaseDate: input.releaseDate,
        isOfficial: input.isOfficial,
        origin: 'user',
        updatedAt: now,
      })
      .where(eq(sets.code, code))
    for (const [lang, name] of Object.entries(input.localizations)) {
      if (name.trim() === '') {
        await tx
          .delete(setLocalizations)
          .where(and(eq(setLocalizations.setCode, code), eq(setLocalizations.lang, lang)))
      } else {
        await tx
          .insert(setLocalizations)
          .values({ setCode: code, lang, name })
          .onConflictDoUpdate({
            target: [setLocalizations.setCode, setLocalizations.lang],
            set: { name },
          })
      }
    }
  })
}

export async function deleteSet(db: DB, code: string): Promise<void> {
  await db.delete(sets).where(eq(sets.code, code))
}

export async function setSymbolFile(db: DB, code: string, symbol: string | null): Promise<void> {
  await db.update(sets).set({ symbol, updatedAt: new Date() }).where(eq(sets.code, code))
}

export async function getCardById(db: DB, id: string, locale?: string): Promise<CardDetailDTO | null> {
  const [card] = await db.select().from(cards).where(eq(cards.id, id)).limit(1)
  if (!card) return null
  const [setRow] = await db.select().from(sets).where(eq(sets.code, card.setCode)).limit(1)
  let setName = setRow?.name
  if (locale && setRow) {
    const [loc] = await db
      .select()
      .from(setLocalizations)
      .where(and(eq(setLocalizations.setCode, card.setCode), eq(setLocalizations.lang, locale)))
      .limit(1)
    setName = loc?.name ?? setRow.name
  }
  const [locRows, typeRows, subTypeRows, rulingRows] = await Promise.all([
    db.select().from(cardLocalizations).where(eq(cardLocalizations.cardId, id)),
    db.select().from(cardTypes).where(eq(cardTypes.cardId, id)),
    db.select().from(cardSubTypes).where(eq(cardSubTypes.cardId, id)),
    db.select().from(cardRulings).where(eq(cardRulings.cardId, id)).orderBy(asc(cardRulings.seq)),
  ])
  const rulingTextRows = rulingRows.length
    ? await db.select().from(cardRulingLocalizations).where(
        inArray(cardRulingLocalizations.rulingId, rulingRows.map((r) => r.id)),
      )
    : []
  const textsByRuling = new Map<string, Record<string, string>>()
  for (const t of rulingTextRows) {
    const m = textsByRuling.get(t.rulingId) ?? {}
    m[t.lang] = t.text
    textsByRuling.set(t.rulingId, m)
  }
  const localizations: Record<string, CardLocalizationDTO> = {}
  for (const l of locRows) {
    localizations[l.lang] = {
      lang: l.lang, name: l.name, status: l.status, source: l.source,
      text: l.text, flavorText: l.flavorText, imageFile: l.imageFile, imageUrl: l.imageUrl,
      adventure: (l.adventure as AdventureData | null) ?? null,
      match: (l.match as MatchData | null) ?? null,
    }
  }
  return {
    id: card.id,
    setCode: card.setCode,
    number: card.number,
    name: card.name,
    types: typeRows.map((t) => t.typeCode),
    subTypes: subTypeRows.map((t) => t.subTypeCode),
    lesson: card.lesson,
    cost: card.cost,
    rarity: card.rarity,
    finish: card.finish,
    legality: card.legality,
    artist: card.artist,
    health: card.health,
    damagePerTurn: card.damagePerTurn,
    orientation: card.orientation,
    defaultLanguage: card.defaultLanguage,
    localizations,
    rulings: rulingRows.map((r) => ({
      id: r.id,
      seq: r.seq,
      date: r.date,
      source: r.source,
      text: textsByRuling.get(r.id) ?? {},
    })),
    set: toSetDTO(setRow, setName),
  }
}

export async function getRandomCardId(db: DB): Promise<string | null> {
  const [row] = await db.select({ id: cards.id }).from(cards).orderBy(sql`random()`).limit(1)
  return row?.id ?? null
}

export async function upsertLocalization(
  db: DB,
  input: {
    cardId: string
    lang: string
    name: string
    text: string | null
    flavorText: string | null
    status: string | null
    adventure?: AdventureData | null
    match?: MatchData | null
  },
): Promise<void> {
  const now = new Date()
  const base = {
    name: input.name,
    text: input.text,
    flavorText: input.flavorText,
    status: input.status,
    origin: 'user' as const,
    updatedAt: now,
  }
  const extra: { adventure?: AdventureData | null; match?: MatchData | null } = {}
  if ('adventure' in input) extra.adventure = input.adventure ?? null
  if ('match' in input) extra.match = input.match ?? null

  await db
    .insert(cardLocalizations)
    .values({ cardId: input.cardId, lang: input.lang, ...base, ...extra })
    .onConflictDoUpdate({
      target: [cardLocalizations.cardId, cardLocalizations.lang],
      set: { ...base, ...extra },
    })
}

export async function setLocalizationImage(
  db: DB,
  cardId: string,
  lang: string,
  imageFile: string | null,
): Promise<void> {
  const now = new Date()
  await db
    .insert(cardLocalizations)
    .values({ cardId, lang, name: '', imageFile, origin: 'user', updatedAt: now })
    .onConflictDoUpdate({
      target: [cardLocalizations.cardId, cardLocalizations.lang],
      set: { imageFile, origin: 'user', updatedAt: now },
    })
}

export async function getCardIndexData(db: DB, cardId: string): Promise<CardIndexData | null> {
  const [card] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1)
  if (!card) return null
  const [setRow] = await db.select().from(sets).where(eq(sets.code, card.setCode)).limit(1)
  const [locRows, typeRows, subTypeRows] = await Promise.all([
    db.select().from(cardLocalizations).where(eq(cardLocalizations.cardId, cardId)),
    db.select().from(cardTypes).where(eq(cardTypes.cardId, cardId)),
    db.select().from(cardSubTypes).where(eq(cardSubTypes.cardId, cardId)),
  ])
  const localizations: CardIndexData['localizations'] = {}
  for (const l of locRows) {
    localizations[l.lang] = { name: l.name, text: l.text, flavorText: l.flavorText, imageFile: l.imageFile }
  }
  return {
    id: card.id,
    setCode: card.setCode,
    number: card.number,
    name: card.name,
    lesson: card.lesson,
    rarity: card.rarity,
    finish: card.finish,
    legality: card.legality,
    cost: card.cost,
    damage: card.damagePerTurn ?? null,
    isOfficial: setRow?.isOfficial ?? false,
    types: typeRows.map((t) => t.typeCode),
    subTypes: subTypeRows.map((t) => t.subTypeCode),
    defaultLanguage: card.defaultLanguage,
    orientation: card.orientation,
    localizations,
  }
}

export async function saveRulings(
  db: DB,
  cardId: string,
  lang: string,
  rows: { id: string | null; date: string | null; source: string | null; text: string }[],
): Promise<void> {
  const clean = rows.filter(
    (r) =>
      r.id !== null ||
      (r.date?.trim() || '') !== '' ||
      (r.source?.trim() || '') !== '' ||
      (r.text?.trim() || '') !== '',
  )
  const now = new Date()
  await db.transaction(async (tx) => {
    const existing = await tx.select({ id: cardRulings.id }).from(cardRulings).where(eq(cardRulings.cardId, cardId))
    const existingIds = new Set(existing.map((e) => e.id))
    const keptIds = new Set<string>()

    for (let i = 0; i < clean.length; i++) {
      const row = clean[i]
      const date = row.date?.trim() || null
      const source = row.source?.trim() || null
      const text = row.text?.trim() || ''
      let id = row.id
      if (id && existingIds.has(id)) {
        keptIds.add(id)
        await tx.update(cardRulings)
          .set({ date, source, seq: i, origin: 'user', updatedAt: now })
          .where(eq(cardRulings.id, id))
      } else {
        id = `${cardId}-r${randomUUID()}`
        await tx.insert(cardRulings).values({ id, cardId, seq: i, date, source, origin: 'user', updatedAt: now })
      }
      if (text) {
        await tx.insert(cardRulingLocalizations)
          .values({ rulingId: id, lang, text })
          .onConflictDoUpdate({ target: [cardRulingLocalizations.rulingId, cardRulingLocalizations.lang], set: { text } })
      } else {
        await tx.delete(cardRulingLocalizations).where(and(eq(cardRulingLocalizations.rulingId, id), eq(cardRulingLocalizations.lang, lang)))
      }
    }

    const toDelete = [...existingIds].filter((id) => !keptIds.has(id))
    if (toDelete.length) await tx.delete(cardRulings).where(inArray(cardRulings.id, toDelete))
  })
}

export async function listRulingSources(db: DB): Promise<string[]> {
  const rows = await db
    .selectDistinct({ source: cardRulings.source })
    .from(cardRulings)
    .where(isNotNull(cardRulings.source))
    .orderBy(asc(cardRulings.source))
  return rows.map((r) => r.source).filter((s): s is string => !!s)
}

export async function getSubTypeLabels(db: DB, lang: string): Promise<Record<string, string>> {
  const rows = await db.select().from(subTypeLocalizations).where(eq(subTypeLocalizations.lang, lang))
  return Object.fromEntries(rows.map((r) => [r.subTypeCode, r.label]))
}

export async function listSubTypesWithTranslations(
  db: DB,
): Promise<{ code: string; labels: Record<string, string> }[]> {
  const codes = await db.select().from(subTypes).orderBy(asc(subTypes.code))
  const trans = await db.select().from(subTypeLocalizations)
  const byCode = new Map<string, Record<string, string>>()
  for (const t of trans) {
    const m = byCode.get(t.subTypeCode) ?? {}
    m[t.lang] = t.label
    byCode.set(t.subTypeCode, m)
  }
  return codes.map((c) => ({ code: c.code, labels: byCode.get(c.code) ?? {} }))
}

export async function saveSubTypeTranslations(
  db: DB,
  rows: { code: string; lang: string; label: string }[],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const r of rows) {
      if (r.label.trim() === '') {
        await tx.delete(subTypeLocalizations).where(
          and(eq(subTypeLocalizations.subTypeCode, r.code), eq(subTypeLocalizations.lang, r.lang)),
        )
      } else {
        await tx.insert(subTypeLocalizations)
          .values({ subTypeCode: r.code, lang: r.lang, label: r.label })
          .onConflictDoUpdate({
            target: [subTypeLocalizations.subTypeCode, subTypeLocalizations.lang],
            set: { label: r.label },
          })
      }
    }
  })
}

export type DeckWriteInput = {
  name: string
  format: DeckFormat
  visibility: DeckVisibility
  cards: { cardId: string; zone: string; quantity: number }[]
}
export type DeckSummary = {
  id: string; name: string; format: DeckFormat; visibility: DeckVisibility
  cardCount: number; updatedAt: string
}

export async function listDecksByUser(db: DB, userId: string): Promise<DeckSummary[]> {
  const rows = await db.select().from(decks).where(eq(decks.userId, userId)).orderBy(desc(decks.updatedAt))
  if (rows.length === 0) return []
  const counts = await db
    .select({ deckId: deckCards.deckId, total: sql<number>`sum(${deckCards.quantity})::int` })
    .from(deckCards)
    .where(inArray(deckCards.deckId, rows.map((r) => r.id)))
    .groupBy(deckCards.deckId)
  const byDeck = new Map(counts.map((c) => [c.deckId, c.total]))
  return rows.map((r) => ({
    id: r.id, name: r.name, format: r.format as DeckFormat, visibility: r.visibility as DeckVisibility,
    cardCount: byDeck.get(r.id) ?? 0, updatedAt: r.updatedAt.toISOString(),
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

// Shared by getDeck (view for every deck_card row, falling back to defaults
// for cards that no longer exist) and getCardViews (import: callers need to
// tell "resolved" apart from "missing" so an absent id here means "skip me").
async function cardViewMetaByIds(db: DB, ids: string[]): Promise<Map<string, Omit<DeckCardView, 'zone' | 'quantity'>>> {
  const uniqueIds = [...new Set(ids)]
  const cardRows = uniqueIds.length ? await db.select().from(cards).where(inArray(cards.id, uniqueIds)) : []
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
    })
  }
  return out
}

// Card view metadata (name/cost/lesson/legality/…) for an arbitrary set of card
// ids, keyed by cardId. Ids with no matching card are simply absent from the
// result — callers (e.g. deck import) use that to flag/skip unresolved cards.
export async function getCardViews(db: DB, ids: string[]): Promise<Record<string, Omit<DeckCardView, 'zone' | 'quantity'>>> {
  return Object.fromEntries(await cardViewMetaByIds(db, ids))
}

export async function getDeck(db: DB, id: string): Promise<{ deck: DeckDTO; userId: string; views: DeckCardView[] } | null> {
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
    }
  })
  const deck: DeckDTO = {
    id: row.id, name: row.name, format: row.format as DeckFormat,
    visibility: row.visibility as DeckVisibility,
    cards: dcs.map((d) => ({ cardId: d.cardId, zone: d.zone as DeckCardView['zone'], quantity: d.quantity })),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  }
  return { deck, userId: row.userId, views }
}

// Viewer-aware read for the public overview page: the owner always sees their
// deck; everyone else (including guests, viewerId=null) only sees it when it is
// public. Returning null for a private deck a viewer can't see means the route
// 404s and can't be used to probe another user's deck IDs.
export async function getDeckForViewer(
  db: DB, id: string, viewerId: string | null,
): Promise<{ deck: DeckDTO; userId: string; views: DeckCardView[] } | null> {
  const res = await getDeck(db, id)
  if (!res) return null
  const isOwner = res.userId === viewerId
  if (!isOwner && res.deck.visibility !== 'public') return null
  return res
}

// Small helper: group junction rows into a code[] per parent id.
function groupCodes<T>(rows: T[], key: (r: T) => string, code: (r: T) => string): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const r of rows) { const k = key(r); const arr = m.get(k) ?? []; arr.push(code(r)); m.set(k, arr) }
  return m
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

// --- public deck browse: likes, views, and the browse query ---

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

export type PublicDeckSort = 'likes' | 'views' | 'newest' | 'updated'
export type PublicDeckEntry = {
  id: string; name: string; format: DeckFormat; author: string
  lessons: string[]; likeCount: number; viewCount: number
  cardCount: number; updatedAt: string; likedByViewer: boolean
  starterCardId: string | null
}
export type ListPublicDecksInput = {
  search?: string; lessons?: string[]; format?: DeckFormat | null
  sort?: PublicDeckSort; page?: number; viewerId?: string | null
}

const PUBLIC_PAGE_SIZE = 24

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
    ? await db.select({ deckId: deckCards.deckId, cardId: deckCards.cardId })
        .from(deckCards).where(and(inArray(deckCards.deckId, ids), eq(deckCards.zone, 'character')))
    : []
  const starterByDeck = new Map(starters.map((s) => [s.deckId, s.cardId]))

  const entries: PublicDeckEntry[] = rows.map((r) => ({
    id: r.id, name: r.name, format: r.format as DeckFormat,
    // Prefer the cased display handle; fall back to the lowercase login
    // username, then the account name.
    author: r.displayUsername ?? r.username ?? r.displayName ?? '—',
    lessons: r.lessons, likeCount: r.likeCount, viewCount: r.viewCount,
    cardCount: byDeck.get(r.id) ?? 0, updatedAt: r.updatedAt.toISOString(),
    likedByViewer: Boolean(r.likedByViewer),
    starterCardId: starterByDeck.get(r.id) ?? null,
  }))
  return { entries, total, page, pageCount, pageSize: PUBLIC_PAGE_SIZE }
}

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

export async function setUserBan(
  db: DB, id: string, reason: string | null, expires: Date | null,
): Promise<void> {
  await db.update(user)
    .set({ banned: true, banReason: reason, banExpires: expires })
    .where(eq(user.id, id))
}

export async function clearUserBan(db: DB, id: string): Promise<void> {
  await db.update(user)
    .set({ banned: false, banReason: null, banExpires: null })
    .where(eq(user.id, id))
}

export async function deleteUserById(db: DB, id: string): Promise<void> {
  await db.delete(user).where(eq(user.id, id))
}
