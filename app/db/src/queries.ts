import { eq, asc, sql, inArray, and, isNotNull } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { DB } from './client'
import { cards, sets, cardLocalizations, cardTypes, cardSubTypes, cardRulings, cardRulingTexts } from './schema'
import type { SetDTO, CardLocalizationDTO, CardDetailDTO, AdventureData, MatchData } from '@revelio/core'
import type { CardIndexData } from '@revelio/search'

type SetRow = typeof sets.$inferSelect

function toSetDTO(row: SetRow): SetDTO {
  return {
    code: row.code,
    name: row.name,
    releaseDate: row.releaseDate,
    isOfficial: row.isOfficial,
    cardCount: row.cardCount,
    symbol: row.symbol,
  }
}

export async function listSets(db: DB): Promise<SetDTO[]> {
  const rows = await db.select().from(sets).orderBy(asc(sets.releaseDate), asc(sets.code))
  return rows.map(toSetDTO)
}

export async function getSetByCode(db: DB, code: string): Promise<SetDTO | null> {
  const [row] = await db.select().from(sets).where(eq(sets.code, code)).limit(1)
  return row ? toSetDTO(row) : null
}

export async function getCardById(db: DB, id: string): Promise<CardDetailDTO | null> {
  const [card] = await db.select().from(cards).where(eq(cards.id, id)).limit(1)
  if (!card) return null
  const [setRow] = await db.select().from(sets).where(eq(sets.code, card.setCode)).limit(1)
  const [locRows, typeRows, subTypeRows, rulingRows] = await Promise.all([
    db.select().from(cardLocalizations).where(eq(cardLocalizations.cardId, id)),
    db.select().from(cardTypes).where(eq(cardTypes.cardId, id)),
    db.select().from(cardSubTypes).where(eq(cardSubTypes.cardId, id)),
    db.select().from(cardRulings).where(eq(cardRulings.cardId, id)).orderBy(asc(cardRulings.seq)),
  ])
  const rulingTextRows = rulingRows.length
    ? await db.select().from(cardRulingTexts).where(
        inArray(cardRulingTexts.rulingId, rulingRows.map((r) => r.id)),
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
    set: toSetDTO(setRow),
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
    setName: setRow?.name ?? card.setCode,
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
        await tx.insert(cardRulingTexts)
          .values({ rulingId: id, lang, text })
          .onConflictDoUpdate({ target: [cardRulingTexts.rulingId, cardRulingTexts.lang], set: { text } })
      } else {
        await tx.delete(cardRulingTexts).where(and(eq(cardRulingTexts.rulingId, id), eq(cardRulingTexts.lang, lang)))
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
