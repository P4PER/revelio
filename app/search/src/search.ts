import type { MeiliSearch } from 'meilisearch'
import { cardsIndex, type SearchDocument } from './documents'

export type CardFilters = {
  setCode?: string[]
  types?: string[]
  subTypes?: string[]
  lesson?: string[]
  rarity?: string[]
  finishes?: string[]
  legality?: string[]
  isOfficial?: boolean
  costMin?: number
  costMax?: number
  ids?: string[]        // restrict to these card ids (ownership: owned/dupes)
  excludeIds?: string[] // exclude these card ids (ownership: missing)
}

export type SearchOptions = {
  filters?: CardFilters
  sort?: string[]
  page?: number
  hitsPerPage?: number
}

// Raw offset/limit window for ids-only reads (searchCardIds). Deliberately not
// part of SearchOptions: a windowed read has no meaningful page number, so
// SearchResult would have to report one it cannot honour.
export type IdWindowOptions = {
  filters?: CardFilters
  sort?: string[]
  offset: number
  limit: number
}

// A summary row: identity plus the few fields a one-line label needs, shared by
// autocomplete and by list views that render nothing else. Deliberately not a
// SearchDocument - restricting attributesToRetrieve means the hits are not whole
// documents, and typing them as such would be a lie.
export type CardSummaryHit = Pick<SearchDocument, (typeof SUMMARY_FIELDS)[number]>

export type SearchResult = {
  hits: SearchDocument[]
  total: number
  page: number
  hitsPerPage: number
}

// A paged read of a chosen subset of each document. The type follows the tuple the
// caller passed, so a renderer cannot read a field the query did not ask for without
// failing to compile.
export type CardProjection<K extends keyof SearchDocument> =
  Omit<SearchResult, 'hits'> & { hits: Pick<SearchDocument, K>[] }

export type CardSummaryResult = CardProjection<(typeof SUMMARY_FIELDS)[number]>

const SUMMARY_FIELDS = ['id', 'name', 'setCode', 'number'] as const

const ARRAY_FACETS: (keyof CardFilters)[] = [
  'setCode', 'types', 'subTypes', 'lesson', 'rarity', 'finishes', 'legality',
]

// The paged read both searchCards and searchCardSummaries run, differing only in
// how much of each document comes back. Hits stay untyped here: the caller knows
// which shape its attributesToRetrieve asked for.
async function pagedSearch(
  client: MeiliSearch,
  lang: string,
  query: string,
  opts: SearchOptions,
  attributesToRetrieve?: readonly string[],
): Promise<{ hits: unknown[]; total: number; page: number; hitsPerPage: number }> {
  const page = opts.page ?? 1
  const hitsPerPage = opts.hitsPerPage ?? 20
  const res = await client.index(cardsIndex(lang)).search(query, {
    filter: buildFilter(opts.filters ?? {}),
    sort: opts.sort,
    limit: hitsPerPage,
    offset: (page - 1) * hitsPerPage,
    // Copied: the Meilisearch client types want a mutable array, and a caller's
    // `as const` tuple must not be handed to a library that could sort it in place.
    ...(attributesToRetrieve ? { attributesToRetrieve: [...attributesToRetrieve] } : {}),
  })
  return { hits: res.hits, total: res.estimatedTotalHits ?? 0, page, hitsPerPage }
}

// Each returned string is AND-ed by Meilisearch; values within a facet are OR-ed.
export function buildFilter(f: CardFilters): string[] {
  const clauses: string[] = []
  for (const key of ARRAY_FACETS) {
    const values = f[key] as string[] | undefined
    if (values && values.length) {
      clauses.push(`(${values.map((v) => `${key} = ${JSON.stringify(v)}`).join(' OR ')})`)
    }
  }
  if (f.isOfficial !== undefined) clauses.push(`isOfficial = ${f.isOfficial}`)
  if (f.costMin != null) clauses.push(`cost >= ${f.costMin}`)
  if (f.costMax != null) clauses.push(`cost <= ${f.costMax}`)
  if (f.ids && f.ids.length) {
    clauses.push(`id IN [${f.ids.map((v) => JSON.stringify(v)).join(',')}]`)
  }
  if (f.excludeIds && f.excludeIds.length) {
    clauses.push(`id NOT IN [${f.excludeIds.map((v) => JSON.stringify(v)).join(',')}]`)
  }
  return clauses
}

export async function searchCards(
  client: MeiliSearch,
  lang: string,
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult> {
  const res = await pagedSearch(client, lang, query, opts)
  return { ...res, hits: res.hits as SearchDocument[] }
}

// The one place a projected read is built. Callers pass a tuple declared `as const`,
// which both goes to Meilisearch as attributesToRetrieve and fixes the hit type.
export async function searchCardFields<K extends keyof SearchDocument>(
  client: MeiliSearch,
  lang: string,
  query: string,
  fields: readonly K[],
  opts: SearchOptions = {},
): Promise<CardProjection<K>> {
  const res = await pagedSearch(client, lang, query, opts, fields as readonly string[])
  return { ...res, hits: res.hits as Pick<SearchDocument, K>[] }
}

// A paged result list that renders "name (set #number)" per row wants the same
// slice as autocomplete, not whole documents: a page of 10 otherwise ships ten
// cards' rules text, flavor text and all 24 indexed fields to render three.
export async function searchCardSummaries(
  client: MeiliSearch,
  lang: string,
  query: string,
  opts: SearchOptions = {},
): Promise<CardSummaryResult> {
  return searchCardFields(client, lang, query, SUMMARY_FIELDS, opts)
}

// Ids-only search over a raw window. Neighbor walks need order and identity,
// not card content, so ask Meilisearch for a single attribute instead of whole
// documents: a set walk then transfers 500 ids, not 500 full card records.
export async function searchCardIds(
  client: MeiliSearch,
  lang: string,
  query: string,
  opts: IdWindowOptions,
): Promise<{ ids: string[]; total: number }> {
  const res = await client.index(cardsIndex(lang)).search(query, {
    filter: buildFilter(opts.filters ?? {}),
    sort: opts.sort,
    limit: opts.limit,
    offset: opts.offset,
    attributesToRetrieve: ['id'],
  })
  return {
    ids: (res.hits as { id: string }[]).map((h) => h.id),
    total: res.estimatedTotalHits ?? 0,
  }
}

// Autocomplete renders "name (set #number)" and nothing else, so asking for
// whole documents would ship a card's rules text and every attribute on every
// keystroke. Same trade as searchCardIds, one step wider: identity plus label.
// A picker only ever reads the first page, so the summary read's page 1 is the
// whole of it and the caller's limit is that page's size.
export async function searchCardSuggestions(
  client: MeiliSearch,
  lang: string,
  query: string,
  limit: number,
): Promise<CardSummaryHit[]> {
  const res = await searchCardSummaries(client, lang, query, { hitsPerPage: limit })
  return res.hits
}
