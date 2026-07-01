import type { DB } from '@revelio/db'
import { cards, sets, cardLocalizations, cardTypes, cardSubTypes, lessons } from '@revelio/db'
import type { SearchDocument } from '@revelio/search'

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
  const [allCards, allSets, allLocs, typeLinks, subTypeLinks, allLessons] = await Promise.all([
    db.select().from(cards),
    db.select().from(sets),
    db.select().from(cardLocalizations),
    db.select().from(cardTypes),
    db.select().from(cardSubTypes),
    db.select().from(lessons),
  ])

  const setByCode = new Map(allSets.map((s) => [s.code, s]))
  const lessonColor = new Map(allLessons.map((l) => [l.code, l.color]))
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

  const out: Record<string, SearchDocument[]> = {}
  for (const lang of languages) {
    out[lang] = allCards.map((c) => {
      const perCard = locByCard.get(c.id)
      const loc = perCard?.get(lang) ?? perCard?.get(c.defaultLanguage)
      const set = setByCode.get(c.setCode)
      return {
        id: c.id,
        setCode: c.setCode,
        setName: set?.name ?? c.setCode,
        number: c.number,
        name: loc?.name ?? c.name,
        text: loc?.text ?? null,
        flavorText: loc?.flavorText ?? null,
        types: typesByCard.get(c.id) ?? [],
        subTypes: subTypesByCard.get(c.id) ?? [],
        lesson: c.lesson,
        lessonColor: c.lesson ? (lessonColor.get(c.lesson) ?? null) : null,
        rarity: c.rarity,
        finish: c.finish,
        legality: c.legality,
        cost: c.cost,
        isOfficial: set?.isOfficial ?? false,
        imageFile: loc?.imageFile ?? null,
      }
    })
  }
  return out
}
