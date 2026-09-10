import 'server-only'
import type { MeiliSearch } from 'meilisearch'
import {
  createMeiliClient,
  searchCardFields,
  searchCards,
  type CardProjection,
  type SearchDocument,
  type SearchResult,
} from '@revelio/search'
import { toSearchOptions, type SearchState } from '@/lib/search-params'

export function getSearchClient(): MeiliSearch {
  const host = process.env.MEILI_HOST
  if (!host) throw new Error('MEILI_HOST is required')
  return createMeiliClient(host, process.env.MEILI_SEARCH_KEY ?? '')
}

export async function runSearch(
  client: MeiliSearch,
  lang: string,
  state: SearchState,
  overrides?: { hitsPerPage?: number },
): Promise<SearchResult> {
  const { query, options } = toSearchOptions(state)
  return searchCards(client, lang, query, { ...options, ...overrides })
}

// Same read as runSearch, but only the fields the calling surface renders. `fields` is
// required rather than optional: an omitted projection is exactly the mistake this is
// here to prevent.
export async function runSearchFields<K extends keyof SearchDocument>(
  client: MeiliSearch,
  lang: string,
  state: SearchState,
  fields: readonly K[],
  overrides?: { hitsPerPage?: number },
): Promise<CardProjection<K>> {
  const { query, options } = toSearchOptions(state)
  return searchCardFields(client, lang, query, fields, { ...options, ...overrides })
}
