import { eq, asc, desc, sql, inArray, and, isNotNull } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { DB } from './client'
import { cards, sets, cardLocalizations, cardTypes, cardSubTypes, cardRulings, cardRulingLocalizations, subTypes, subTypeLocalizations, setLocalizations, decks, deckCards } from './schema'
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
  const [row] = await db.select().from(sets).where(eq(sets.code, code)).limit(1)
  if (!row) return null
  if (!locale) return toSetDTO(row)
  const [loc] = await db
    .select()
    .from(setLocalizations)
    .where(and(eq(setLocalizations.setCode, code), eq(setLocalizations.lang, locale)))
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
    isOfficial: setRow?.isOfficial ?? false,
    types: typeRows.map((t) => t.typeCode),
    subTypes: subTypeRows.map((t) => t.subTypeCode),
    defaultLanguage: card.defaultLanguage,
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

export async function getDeck(db: DB, id: string): Promise<{ deck: DeckDTO; userId: string; views: DeckCardView[] } | null> {
  const [row] = await db.select().from(decks).where(eq(decks.id, id)).limit(1)
  if (!row) return null
  const dcs = await db.select().from(deckCards).where(eq(deckCards.deckId, id))
  const ids = dcs.map((d) => d.cardId)
  const cardRows = ids.length ? await db.select().from(cards).where(inArray(cards.id, ids)) : []
  const typeRows = ids.length ? await db.select().from(cardTypes).where(inArray(cardTypes.cardId, ids)) : []
  const subRows = ids.length ? await db.select().from(cardSubTypes).where(inArray(cardSubTypes.cardId, ids)) : []
  const setCodes = [...new Set(cardRows.map((c) => c.setCode))]
  const setRows = setCodes.length ? await db.select().from(sets).where(inArray(sets.code, setCodes)) : []
  const isOfficialBySetCode = new Map(setRows.map((s) => [s.code, s.isOfficial]))
  const byId = new Map(cardRows.map((c) => [c.id, c]))
  const typesById = groupCodes(typeRows, (r) => r.cardId, (r) => r.typeCode)
  const subsById = groupCodes(subRows, (r) => r.cardId, (r) => r.subTypeCode)

  const views: DeckCardView[] = dcs.map((d) => {
    const c = byId.get(d.cardId)
    const m = deckCardMeta({
      id: d.cardId, isOfficial: (c && isOfficialBySetCode.get(c.setCode)) ?? false, legality: c?.legality ?? null,
      types: typesById.get(d.cardId) ?? [], subTypes: subsById.get(d.cardId) ?? [],
    })
    return {
      cardId: d.cardId, zone: d.zone as DeckCardView['zone'], quantity: d.quantity,
      name: c?.name ?? d.cardId, cost: c?.cost ?? null, setCode: c?.setCode ?? '',
      lesson: c?.lesson ?? null, isOfficial: m.isOfficial, legality: m.legality,
      isLesson: m.isLesson, isStartingCharacter: m.isStartingCharacter,
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
  db: DB, names: { name: string; setCode: string | null }[],
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  for (const n of names) {
    const key = `${n.name.toLowerCase()}|${n.setCode ?? ''}`
    if (key in out) continue
    const where = n.setCode
      ? and(sql`lower(${cards.name}) = ${n.name.toLowerCase()}`, eq(cards.setCode, n.setCode))
      : sql`lower(${cards.name}) = ${n.name.toLowerCase()}`
    const rows = await db.select({ id: cards.id }).from(cards).where(where).limit(2)
    out[key] = rows.length === 1 ? rows[0].id : null // ambiguous (>1) or missing (0) → null
  }
  return out
}
