import 'server-only'
import type { MeiliSearch } from 'meilisearch'
import {
  createMeiliClient,
  searchCardFields,
  type CardProjection,
  type SearchDocument,
} from '@revelio/search'
import { toSearchOptions, type SearchState } from '@/lib/search-params'

export function getSearchClient(): MeiliSearch {
  const host = process.env.MEILI_HOST
  if (!host) throw new Error('MEILI_HOST is required')
  return createMeiliClient(host, process.env.MEILI_SEARCH_KEY ?? '')
}

// The one search read the web app has, and it renders only the fields the calling
// surface asked for. `fields` is required rather than optional: an omitted projection
// is exactly the mistake this signature is here to prevent.
export async function runSearch<K extends keyof SearchDocument>(
  client: MeiliSearch,
  lang: string,
  state: SearchState,
  fields: readonly K[],
  overrides?: { hitsPerPage?: number },
): Promise<CardProjection<K>> {
  const { query, options } = toSearchOptions(state)
  return searchCardFields(client, lang, query, fields, { ...options, ...overrides })
}
