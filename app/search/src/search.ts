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

export type SearchResult = {
  hits: SearchDocument[]
  total: number
  page: number
  hitsPerPage: number
}

const ARRAY_FACETS: (keyof CardFilters)[] = [
  'setCode', 'types', 'subTypes', 'lesson', 'rarity', 'finishes', 'legality',
]

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
  const page = opts.page ?? 1
  const hitsPerPage = opts.hitsPerPage ?? 20
  const res = await client.index(cardsIndex(lang)).search(query, {
    filter: buildFilter(opts.filters ?? {}),
    sort: opts.sort,
    limit: hitsPerPage,
    offset: (page - 1) * hitsPerPage,
  })
  return {
    hits: res.hits as SearchDocument[],
    total: res.estimatedTotalHits ?? 0,
    page,
    hitsPerPage,
  }
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
