import type { Settings } from 'meilisearch'

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
