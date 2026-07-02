import { eq, asc } from 'drizzle-orm'
import type { DB } from './client'
import { cards, sets, cardLocalizations, cardTypes, cardSubTypes, cardRulings } from './schema'
import type { SetDTO, CardLocalizationDTO, CardDetailDTO } from '@revelio/core'

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
  const localizations: Record<string, CardLocalizationDTO> = {}
  for (const l of locRows) {
    localizations[l.lang] = {
      lang: l.lang, name: l.name, status: l.status, source: l.source,
      text: l.text, flavorText: l.flavorText, imageFile: l.imageFile, imageUrl: l.imageUrl,
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
      seq: r.seq, date: r.date, source: r.source, text: (r.text ?? {}) as Record<string, string>,
    })),
    set: toSetDTO(setRow),
  }
}
