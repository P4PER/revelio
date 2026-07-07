import 'server-only'
import type { MeiliSearch } from 'meilisearch'
import { createMeiliClient, searchCards, type SearchResult } from '@revelio/search'
import { toSearchOptions, type SearchState } from './search-params'

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
