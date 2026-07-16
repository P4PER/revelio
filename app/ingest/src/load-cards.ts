import type { DB } from '@revelio/db'
import { cards, cardLocalizations, cardTypes, cardSubTypes, cardRulings, cardRulingLocalizations } from '@revelio/db'
import { slugify } from '@revelio/core'
import type { DistCard } from './types.js'

export async function loadCards(db: DB, input: DistCard[]): Promise<void> {
  if (input.length === 0) return

  const cardRows = input.map((c) => ({
    id: c.id,
    setCode: c.setCode,
    number: c.number,
    name: c.name,
    lesson: c.lesson ? slugify(c.lesson) : null,
    cost: c.cost,
    provides: c.provides ?? null,
    rarity: c.rarity ? slugify(c.rarity) : null,
    finishes: (c.finishes ?? ['normal']).map(slugify),
    artist: c.artist,
    health: c.stats?.health ?? null,
    damagePerTurn: c.stats?.damagePerTurn ?? null,
    orientation: c.orientation,
    legality: c.legality ? slugify(c.legality) : null,
    draftValue: c.draftValue,
    defaultLanguage: c.defaultLanguage,
    languages: c.languages,
    origin: 'import' as const,
  }))
  await db.insert(cards).values(cardRows).onConflictDoNothing({ target: cards.id })

  const locRows = input.flatMap((c) =>
    Object.entries(c.localizations).map(([lang, l]) => ({
      cardId: c.id,
      lang,
      name: l.name,
      status: l.status,
      source: l.source,
      origin: 'import' as const,
      text: l.text,
      flavorText: l.flavorText,
      adventure: l.adventure ?? null,
      match: l.match ?? null,
      imageFile: l.image?.file ?? null,
      imageUrl: l.image?.url ?? null,
    })),
  )
  if (locRows.length)
    await db
      .insert(cardLocalizations)
      .values(locRows)
      .onConflictDoNothing({ target: [cardLocalizations.cardId, cardLocalizations.lang] })

  const typeLinks = input.flatMap((c) => c.types.map((code) => ({ cardId: c.id, typeCode: slugify(code) })))
  if (typeLinks.length) await db.insert(cardTypes).values(typeLinks).onConflictDoNothing()

  const subTypeLinks = input.flatMap((c) => c.subTypes.map((code) => ({ cardId: c.id, subTypeCode: slugify(code) })))
  if (subTypeLinks.length) await db.insert(cardSubTypes).values(subTypeLinks).onConflictDoNothing()

  type Ruling = { date?: string | null; source?: string | null; ruling?: string | null }
  const rulingParents = input.flatMap((c) =>
    (Array.isArray(c.rulings) ? (c.rulings as Ruling[]) : []).map((r, i) => ({
      id: `${c.id}-r${i}`,
      cardId: c.id,
      seq: i,
      date: r.date ?? null,
      source: r.source ?? null,
    })),
  )
  const rulingTexts = input.flatMap((c) =>
    (Array.isArray(c.rulings) ? (c.rulings as Ruling[]) : [])
      .map((r, i) => ({ r, i }))
      .filter(({ r }) => !!r.ruling)
      .map(({ r, i }) => ({ rulingId: `${c.id}-r${i}`, lang: c.defaultLanguage, text: r.ruling as string })),
  )
  if (rulingParents.length) await db.insert(cardRulings).values(rulingParents).onConflictDoNothing()
  if (rulingTexts.length) await db.insert(cardRulingLocalizations).values(rulingTexts).onConflictDoNothing()
}
