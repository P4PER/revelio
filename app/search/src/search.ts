import type { FederatedMultiSearchParams, MeiliSearch, SearchResponse } from 'meilisearch'
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

// What a read asks of one index, minus the window it reads. Shared by the plain read
// and by each federated sub-query, which must be identical in everything but the
// attributes they search.
type ReadParams = {
  filter: string[]
  sort?: string[]
  attributesToRetrieve?: string[]
}

// One window of hits, however the read had to be run.
type HitWindow = { hits: unknown[]; total: number }

const SUMMARY_FIELDS = ['id', 'name', 'setCode', 'number'] as const

const ARRAY_FACETS: (keyof CardFilters)[] = [
  'setCode', 'types', 'subTypes', 'lesson', 'rarity', 'finishes', 'legality',
]

// Meilisearch ranks a document that matched every query term above one that matched
// fewer, whatever rankingRules says: the term-dropping happens while the query graph is
// resolved, above the rules. So "Harry Potter" puts every card whose flavor text holds
// both words above "Harry Hunting", whose name holds one, and a name search reads as
// name hits, then flavor hits, then name hits again.
//
// Federating a name-restricted query against the unrestricted one fixes what the rules
// cannot express. Meilisearch merges the two by rankingScore * weight and keeps each
// document's best, so weighting the name query lifts every name match above every text
// or flavor match, while ranking inside each group stays Meilisearch's own. Scores are
// bounded by 1, which is what makes 10 a separation rather than a lucky margin.
const NAME_MATCH_WEIGHT = 10

// Relevance decides the order only when there is something to rank and the caller has
// not asked for an explicit one. An explicit sort must outrank the name-first grouping,
// and an empty query matches every document in both sub-queries at the same score,
// which would replace the sort order with an arbitrary one.
function ranksByRelevance(query: string, sort?: string[]): boolean {
  return query.trim() !== '' && !sort?.length
}

// A federated hit carries Meilisearch's merge bookkeeping. Drop it: a projected hit is
// typed as exactly the fields its caller asked for, and this is not one of them.
function stripFederation(hit: Record<string, unknown>): Record<string, unknown> {
  const rest = { ...hit }
  delete rest._federation
  return rest
}

// The one Meilisearch read in this module. Both the paged read and the raw id window go
// through it, so a result grid and the card page's prev/next walk cannot end up ordering
// the same result set differently.
async function readWindow(
  client: MeiliSearch,
  lang: string,
  query: string,
  params: ReadParams,
  window: { offset: number; limit: number },
): Promise<HitWindow> {
  const indexUid = cardsIndex(lang)
  if (!ranksByRelevance(query, params.sort)) {
    const res = await client.index(indexUid).search(query, { ...params, ...window })
    return { hits: res.hits, total: res.estimatedTotalHits ?? 0 }
  }
  const federated: FederatedMultiSearchParams = {
    federation: window,
    queries: [
      {
        indexUid, q: query, ...params,
        attributesToSearchOn: ['name'],
        federationOptions: { weight: NAME_MATCH_WEIGHT },
      },
      { indexUid, q: query, ...params, federationOptions: { weight: 1 } },
    ],
  }
  // The client's two multiSearch overloads resolve to the non-federated one for any
  // argument that also satisfies MultiSearchParams, which a federated request does, so
  // the federated response type has to be named here or `hits` does not exist on it.
  const res = (await client.multiSearch(federated)) as unknown as SearchResponse
  return {
    hits: res.hits.map((hit) => stripFederation(hit as Record<string, unknown>)),
    total: res.estimatedTotalHits ?? 0,
  }
}

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
  const res = await readWindow(
    client, lang, query,
    {
      filter: buildFilter(opts.filters ?? {}),
      sort: opts.sort,
      // Copied: the Meilisearch client types want a mutable array, and a caller's
      // `as const` tuple must not be handed to a library that could sort it in place.
      ...(attributesToRetrieve ? { attributesToRetrieve: [...attributesToRetrieve] } : {}),
    },
    { offset: (page - 1) * hitsPerPage, limit: hitsPerPage },
  )
  return { ...res, page, hitsPerPage }
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
  const res = await readWindow(
    client, lang, query,
    { filter: buildFilter(opts.filters ?? {}), sort: opts.sort, attributesToRetrieve: ['id'] },
    { offset: opts.offset, limit: opts.limit },
  )
  return { ids: (res.hits as { id: string }[]).map((h) => h.id), total: res.total }
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
