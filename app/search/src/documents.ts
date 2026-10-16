import { MeilisearchApiError, type Index, type Settings, type Meilisearch } from 'meilisearch'
import { effectiveImageLang } from '@revelio/core'
import { waitForSuccess } from './tasks'

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
  artCropVersion: number | null
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

// Hard ceiling Meilisearch puts on offset + limit: any read past it comes back
// empty, so callers that page or window deep must clamp against this value.
export const MAX_TOTAL_HITS = 5000

// name is first in searchableAttributes so name matches outrank text/flavor matches.
export const CARD_INDEX_SETTINGS: Settings = {
  searchableAttributes: ['name', 'text', 'flavorText'],
  filterableAttributes: [
    'id', 'setCode', 'types', 'subTypes', 'lesson', 'rarity', 'finishes', 'legality', 'cost', 'isOfficial',
  ],
  sortableAttributes: ['numberSort', 'name', 'cost'],
  rankingRules: ['words', 'typo', 'proximity', 'attribute', 'sort', 'exactness'],
  typoTolerance: { enabled: true },
  // Default maxTotalHits is 1000, which caps the reported total and makes cards
  // past #1000 unreachable via pagination. The dataset is ~1098 cards; leave headroom.
  pagination: { maxTotalHits: MAX_TOTAL_HITS },
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
  // Card-level (default-language) art-crop version; not per-language, so it's
  // copied verbatim onto every language document.
  artCropVersion: number | null
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
    artCropVersion: d.artCropVersion,
    defaultLanguage: d.defaultLanguage,
    orientation: d.orientation,
  }
}

// Whether ingest has created this index. Asked first because adding a document
// to a missing index creates it, with none of CARD_INDEX_SETTINGS, under any key
// that may create indexes.
async function indexExists(index: Index): Promise<boolean> {
  try {
    await index.getRawInfo()
    return true
  } catch (err) {
    if (err instanceof MeilisearchApiError && err.cause?.code === 'index_not_found') return false
    throw err
  }
}

// Re-index one card's document into each language index it has a localization for.
// Waits for each task so callers observe a consistent index. A language whose
// index ingest never created is skipped: it holds nothing to go stale. Every
// language is attempted, and one error naming each that failed is thrown after.
// Settings are ingest's: the scoped write key web calls this with may add
// documents, look an index up and read tasks, nothing more.
export async function reindexCard(
  client: Meilisearch,
  data: CardIndexData,
  langs: string[] = Object.keys(data.localizations),
): Promise<void> {
  const failures: string[] = []
  for (const lang of langs) {
    const index = client.index(cardsIndex(lang))
    try {
      if (!(await indexExists(index))) continue
      await waitForSuccess(index.addDocuments([buildCardDocument(data, lang)], { primaryKey: 'id' }))
    } catch (err) {
      failures.push(`${lang} (${err instanceof Error ? err.message : String(err)})`)
    }
  }
  if (failures.length > 0) {
    throw new Error(`reindexCard ${data.id} failed for ${failures.join('; ')}`)
  }
}
