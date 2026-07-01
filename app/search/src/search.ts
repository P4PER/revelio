import type { MeiliSearch } from 'meilisearch'
import { cardsIndex, type SearchDocument } from './documents.js'

export type CardFilters = {
  setCode?: string[]
  types?: string[]
  subTypes?: string[]
  lesson?: string[]
  rarity?: string[]
  finish?: string[]
  legality?: string[]
  isOfficial?: boolean
}

export type SearchOptions = {
  filters?: CardFilters
  sort?: string[]
  page?: number
  hitsPerPage?: number
}

export type SearchResult = {
  hits: SearchDocument[]
  total: number
  page: number
  hitsPerPage: number
}

const ARRAY_FACETS: (keyof CardFilters)[] = [
  'setCode', 'types', 'subTypes', 'lesson', 'rarity', 'finish', 'legality',
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
    total: res.estimatedTotalHits ?? res.hits.length,
    page,
    hitsPerPage,
  }
}
