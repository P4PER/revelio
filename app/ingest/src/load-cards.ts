import type { DB } from '@revelio/db'
import { cards, cardLocalizations, cardTypes, cardSubTypes } from '@revelio/db'
import type { DistCard } from './types.js'

export async function loadCards(db: DB, input: DistCard[]): Promise<void> {
  if (input.length === 0) return

  const cardRows = input.map((c) => ({
    id: c.id,
    setCode: c.setCode,
    number: c.number,
    name: c.name,
    lesson: c.lesson,
    cost: c.cost,
    provides: c.provides ?? null,
    rarity: c.rarity,
    finish: c.finish,
    artist: c.artist,
    health: c.stats?.health ?? null,
    damagePerTurn: c.stats?.damagePerTurn ?? null,
    orientation: c.orientation,
    legality: c.legality,
    draftValue: c.draftValue,
    rulings: c.rulings ?? [],
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
  await db
    .insert(cardLocalizations)
    .values(locRows)
    .onConflictDoNothing({ target: [cardLocalizations.cardId, cardLocalizations.lang] })

  const typeLinks = input.flatMap((c) => c.types.map((code) => ({ cardId: c.id, typeCode: code })))
  if (typeLinks.length) await db.insert(cardTypes).values(typeLinks).onConflictDoNothing()

  const subTypeLinks = input.flatMap((c) => c.subTypes.map((code) => ({ cardId: c.id, subTypeCode: code })))
  if (subTypeLinks.length) await db.insert(cardSubTypes).values(subTypeLinks).onConflictDoNothing()
}
