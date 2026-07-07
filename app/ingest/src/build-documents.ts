import type { DB } from '@revelio/db'
import { cards, sets, cardLocalizations, cardTypes, cardSubTypes } from '@revelio/db'
import type { SearchDocument, CardIndexData } from '@revelio/search'
import { buildCardDocument } from '@revelio/search'

function groupValues<T>(rows: T[], key: (r: T) => string, val: (r: T) => string): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const r of rows) {
    const k = key(r)
    const list = m.get(k) ?? []
    list.push(val(r))
    m.set(k, list)
  }
  return m
}

export async function buildDocuments(db: DB): Promise<Record<string, SearchDocument[]>> {
  const [allCards, allSets, allLocs, typeLinks, subTypeLinks] = await Promise.all([
    db.select().from(cards),
    db.select().from(sets),
    db.select().from(cardLocalizations),
    db.select().from(cardTypes),
    db.select().from(cardSubTypes),
  ])

  const setByCode = new Map(allSets.map((s) => [s.code, s]))
  const typesByCard = groupValues(typeLinks, (t) => t.cardId, (t) => t.typeCode)
  const subTypesByCard = groupValues(subTypeLinks, (t) => t.cardId, (t) => t.subTypeCode)

  // cardId -> lang -> localization row
  const locByCard = new Map<string, Map<string, (typeof allLocs)[number]>>()
  const languages = new Set<string>()
  for (const loc of allLocs) {
    languages.add(loc.lang)
    const perCard = locByCard.get(loc.cardId) ?? new Map()
    perCard.set(loc.lang, loc)
    locByCard.set(loc.cardId, perCard)
  }

  const langs = [...languages]
  const dataByCard: CardIndexData[] = allCards.map((c) => {
    const perCard = locByCard.get(c.id)
    const set = setByCode.get(c.setCode)
    const localizations: Record<string, { name: string; text: string | null; flavorText: string | null; imageFile: string | null }> = {}
    if (perCard) {
      for (const [lang, loc] of perCard) {
        localizations[lang] = { name: loc.name, text: loc.text, flavorText: loc.flavorText, imageFile: loc.imageFile }
      }
    }
    return {
      id: c.id,
      setCode: c.setCode,
      number: c.number,
      name: c.name,
      lesson: c.lesson,
      rarity: c.rarity,
      finish: c.finish,
      legality: c.legality,
      cost: c.cost,
      isOfficial: set?.isOfficial ?? false,
      types: typesByCard.get(c.id) ?? [],
      subTypes: subTypesByCard.get(c.id) ?? [],
      defaultLanguage: c.defaultLanguage,
      localizations,
    }
  })

  const out: Record<string, SearchDocument[]> = {}
  for (const lang of langs) {
    out[lang] = dataByCard.map((d) => buildCardDocument(d, lang))
  }
  return out
}
