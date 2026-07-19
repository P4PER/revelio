import type { Settings, MeiliSearch } from 'meilisearch'
import { effectiveImageLang } from '@revelio/core'

export type SearchDocument = {
  id: string
  setCode: string
  number: string
  numberSort: string
  name: string
  text: string | null
  flavorText: string | null
  types: string[]
  subTypes: string[]
  lesson: string | null
  rarity: string | null
  finishes: string[]
  legality: string | null
  cost: number | null
  damage: number | null
  isOfficial: boolean
  imageLang: string | null
  imageVersion: number | null
  defaultLanguage: string
  orientation: string | null
}

export function cardsIndex(lang: string): string {
  return `cards-${lang}`
}

// Card numbers are strings ("3", "3a", "10b"), which Meilisearch would sort
// lexicographically ("10" before "2"). Zero-pad the leading numeric part so the
// lexicographic order of this key matches natural card-number order, keeping any
// letter suffix to break ties ("3" < "3a" < "3b" < "4" < "10a").
//
// A leading class marker keeps the two shapes intentionally ordered: numbered
// cards ("0:") always sort before any card lacking a numeric prefix ("1:"),
// rather than colliding by accident of ASCII.
export function cardNumberSortKey(number: string): string {
  const m = /^(\d+)(.*)$/.exec(number)
  if (!m) return `1:${number.toLowerCase()}`
  const [, digits, rest] = m
  return `0:${digits.padStart(6, '0')}${rest.toLowerCase()}`
}

// name is first in searchableAttributes so name matches outrank text/flavor matches.
export const CARD_INDEX_SETTINGS: Settings = {
  searchableAttributes: ['name', 'text', 'flavorText'],
  filterableAttributes: [
    'id', 'setCode', 'types', 'subTypes', 'lesson', 'rarity', 'finishes', 'legality', 'cost', 'isOfficial',
  ],
  sortableAttributes: ['numberSort', 'name', 'cost'],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  typoTolerance: { enabled: true },
}

export type LocalizationFields = {
  name: string
  text: string | null
  flavorText: string | null
  imageVersion: number | null
}

// Everything needed to build a card's search documents across languages.
export type CardIndexData = {
  id: string
  setCode: string
  number: string
  name: string // card-level fallback name
  lesson: string | null
  rarity: string | null
  finishes: string[]
  legality: string | null
  cost: number | null
  damage: number | null
  isOfficial: boolean
  types: string[]
  subTypes: string[]
  defaultLanguage: string
  orientation: string | null
  localizations: Record<string, LocalizationFields>
}

export function buildCardDocument(d: CardIndexData, lang: string): SearchDocument {
  const loc = d.localizations[lang] ?? d.localizations[d.defaultLanguage]
  const imageLang = effectiveImageLang((l) => d.localizations[l]?.imageVersion != null, lang, d.defaultLanguage)
  return {
    id: d.id,
    setCode: d.setCode,
    number: d.number,
    numberSort: cardNumberSortKey(d.number),
    name: loc?.name || d.name,
    text: loc?.text ?? null,
    flavorText: loc?.flavorText ?? null,
    types: d.types,
    subTypes: d.subTypes,
    lesson: d.lesson,
    rarity: d.rarity,
    finishes: d.finishes,
    legality: d.legality,
    cost: d.cost,
    damage: d.damage,
    isOfficial: d.isOfficial,
    imageLang,
    imageVersion: imageLang ? d.localizations[imageLang]!.imageVersion : null,
    defaultLanguage: d.defaultLanguage,
    orientation: d.orientation,
  }
}

// Re-index one card's document into each language index it has a localization for.
// Waits for each task so callers observe a consistent index.
export async function reindexCard(
  client: MeiliSearch,
  data: CardIndexData,
  langs: string[] = Object.keys(data.localizations),
): Promise<void> {
  for (const lang of langs) {
    const index = client.index(cardsIndex(lang))
    const s = await index.updateSettings(CARD_INDEX_SETTINGS)
    await client.waitForTask(s.taskUid)
    const a = await index.addDocuments([buildCardDocument(data, lang)], { primaryKey: 'id' })
    await client.waitForTask(a.taskUid)
  }
}
