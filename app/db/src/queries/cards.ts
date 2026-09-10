import { eq, ne, asc, sql, inArray, and, or, isNull, isNotNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { DB } from '../client'
import { cards, sets, cardLocalizations, cardTypes, cardSubTypes, cardRulings, cardRulingLocalizations, setLocalizations } from '../schema'
import type { CardLocalizationDTO, CardDetailDTO, RulingDTO, CardRulingsDTO, AdventureData, MatchData } from '@revelio/core'
import type { CardIndexData } from '@revelio/search'
import { toSetDTO } from './sets'
import type { SitemapEntry } from './types'

export type ShowcaseCandidate = { id: string; name: string; imageVersion: number }

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
      text: l.text, flavorText: l.flavorText, imageVersion: l.imageVersion,
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
    finishes: card.finishes,
    legality: card.legality,
    artist: card.artist,
    health: card.health,
    damagePerTurn: card.damagePerTurn,
    orientation: card.orientation,
    defaultLanguage: card.defaultLanguage,
    artCropVersion: card.artCropVersion,
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

// The rulings of one card in a single round trip. getCardById answers this too,
// but it runs eight queries to assemble a whole CardDetailDTO; callers that only
// render rulings (the Discord bot's /card) pay that for two fields.
export async function getCardRulings(db: DB, cardId: string): Promise<CardRulingsDTO | null> {
  const rows = await db
    .select({
      defaultLanguage: cards.defaultLanguage,
      rulingId: cardRulings.id,
      seq: cardRulings.seq,
      date: cardRulings.date,
      source: cardRulings.source,
      lang: cardRulingLocalizations.lang,
      text: cardRulingLocalizations.text,
    })
    .from(cards)
    .leftJoin(cardRulings, eq(cardRulings.cardId, cards.id))
    .leftJoin(cardRulingLocalizations, eq(cardRulingLocalizations.rulingId, cardRulings.id))
    .where(eq(cards.id, cardId))
    .orderBy(asc(cardRulings.seq))
  // No rows means no such card. A card with no rulings still yields one row,
  // with every joined column null.
  if (rows.length === 0) return null
  const byId = new Map<string, RulingDTO>()
  for (const row of rows) {
    if (row.rulingId === null || row.seq === null) continue
    let ruling = byId.get(row.rulingId)
    if (!ruling) {
      ruling = { id: row.rulingId, seq: row.seq, date: row.date, source: row.source, text: {} }
      byId.set(row.rulingId, ruling)
    }
    if (row.lang !== null && row.text !== null) ruling.text[row.lang] = row.text
  }
  return { defaultLanguage: rows[0].defaultLanguage, rulings: [...byId.values()] }
}

export async function getRandomCardId(db: DB): Promise<string | null> {
  const [row] = await db.select({ id: cards.id }).from(cards).orderBy(sql`random()`).limit(1)
  return row?.id ?? null
}

// Portrait, image-bearing cards for the home showcase, locale name resolved.
// The card image is the default-language localization's `imageVersion` (same as
// the search index uses); `name` is the locale's localization, falling back to
// the base card name. Stable order (by id) so the daily picker is deterministic;
// selection is locale-independent — locale only affects the resolved name.
export async function getDailyShowcaseCandidates(
  db: DB,
  locale: string,
): Promise<ShowcaseCandidate[]> {
  const nameLoc = alias(cardLocalizations, 'showcase_name_loc')
  const imgLoc = alias(cardLocalizations, 'showcase_img_loc')
  const rows = await db
    .select({
      id: cards.id,
      baseName: cards.name,
      localName: nameLoc.name,
      imageVersion: imgLoc.imageVersion,
    })
    .from(cards)
    .leftJoin(nameLoc, and(eq(nameLoc.cardId, cards.id), eq(nameLoc.lang, locale)))
    .innerJoin(imgLoc, and(eq(imgLoc.cardId, cards.id), eq(imgLoc.lang, cards.defaultLanguage)))
    .where(
      and(
        isNotNull(imgLoc.imageVersion),
        or(isNull(cards.orientation), ne(cards.orientation, 'horizontal')),
      ),
    )
    .orderBy(asc(cards.id))
  return rows.map((r) => ({ id: r.id, name: r.localName ?? r.baseName, imageVersion: r.imageVersion! }))
}

// Minimal rows for the XML sitemap: id/code + last-modified for <lastmod>.
export async function listCardsForSitemap(db: DB): Promise<SitemapEntry[]> {
  return db.select({ id: cards.id, updatedAt: cards.updatedAt }).from(cards).orderBy(asc(cards.id))
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
    localizations[l.lang] = { name: l.name, text: l.text, flavorText: l.flavorText, imageVersion: l.imageVersion }
  }
  return {
    id: card.id,
    setCode: card.setCode,
    number: card.number,
    name: card.name,
    lesson: card.lesson,
    rarity: card.rarity,
    finishes: card.finishes,
    legality: card.legality,
    cost: card.cost,
    damage: card.damagePerTurn ?? null,
    isOfficial: setRow?.isOfficial ?? false,
    types: typeRows.map((t) => t.typeCode),
    subTypes: subTypeRows.map((t) => t.subTypeCode),
    defaultLanguage: card.defaultLanguage,
    orientation: card.orientation,
    artCropVersion: card.artCropVersion ?? null,
    localizations,
  }
}

export async function getCardFinishes(db: DB, cardId: string): Promise<string[] | null> {
  const [row] = await db.select({ finishes: cards.finishes }).from(cards).where(eq(cards.id, cardId)).limit(1)
  return row ? row.finishes : null
}
