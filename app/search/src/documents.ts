import type { Settings, MeiliSearch } from 'meilisearch'

export type SearchDocument = {
  id: string
  setCode: string
  setName: string
  number: string
  name: string
  text: string | null
  flavorText: string | null
  types: string[]
  subTypes: string[]
  lesson: string | null
  lessonColor: string | null
  rarity: string | null
  finish: string | null
  legality: string | null
  cost: number | null
  isOfficial: boolean
  imageFile: string | null
}

export function cardsIndex(lang: string): string {
  return `cards-${lang}`
}

// name is first in searchableAttributes so name matches outrank text/flavor matches.
export const CARD_INDEX_SETTINGS: Settings = {
  searchableAttributes: ['name', 'text', 'flavorText'],
  filterableAttributes: [
    'setCode', 'types', 'subTypes', 'lesson', 'rarity', 'finish', 'legality', 'cost', 'isOfficial',
  ],
  sortableAttributes: ['number', 'name', 'cost'],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  typoTolerance: { enabled: true },
}

export type LocalizationFields = {
  name: string
  text: string | null
  flavorText: string | null
  imageFile: string | null
}

// Everything needed to build a card's search documents across languages.
export type CardIndexData = {
  id: string
  setCode: string
  setName: string
  number: string
  name: string // card-level fallback name
  lesson: string | null
  lessonColor: string | null
  rarity: string | null
  finish: string | null
  legality: string | null
  cost: number | null
  isOfficial: boolean
  types: string[]
  subTypes: string[]
  defaultLanguage: string
  localizations: Record<string, LocalizationFields>
}

export function buildCardDocument(d: CardIndexData, lang: string): SearchDocument {
  const loc = d.localizations[lang] ?? d.localizations[d.defaultLanguage]
  return {
    id: d.id,
    setCode: d.setCode,
    setName: d.setName,
    number: d.number,
    name: loc?.name ?? d.name,
    text: loc?.text ?? null,
    flavorText: loc?.flavorText ?? null,
    types: d.types,
    subTypes: d.subTypes,
    lesson: d.lesson,
    lessonColor: d.lesson ? (d.lessonColor ?? null) : null,
    rarity: d.rarity,
    finish: d.finish,
    legality: d.legality,
    cost: d.cost,
    isOfficial: d.isOfficial,
    imageFile: loc?.imageFile ?? null,
  }
}

// Re-index one card's document into each language index it has a localization for.
// Waits for each task so callers observe a consistent index.
export async function reindexCard(client: MeiliSearch, data: CardIndexData): Promise<void> {
  for (const lang of Object.keys(data.localizations)) {
    const index = client.index(cardsIndex(lang))
    const s = await index.updateSettings(CARD_INDEX_SETTINGS)
    await client.waitForTask(s.taskUid)
    const a = await index.addDocuments([buildCardDocument(data, lang)], { primaryKey: 'id' })
    await client.waitForTask(a.taskUid)
  }
}
