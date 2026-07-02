import type { CardFilters, SearchOptions } from '@revelio/search'

export type SortKey = 'relevance' | 'name' | 'number' | 'cost'
export type SearchState = {
  q: string
  types: string[]
  lessons: string[]
  official: boolean | null
  sort: SortKey
  page: number
  set?: string
}

const SORT_KEYS: SortKey[] = ['relevance', 'name', 'number', 'cost']
const SORT_MEILI: Record<Exclude<SortKey, 'relevance'>, string> = {
  name: 'name:asc',
  number: 'number:asc',
  cost: 'cost:asc',
}
const HITS_PER_PAGE = 24

export function parseSearchParams(sp: URLSearchParams): SearchState {
  const list = (k: string) => sp.getAll(k).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)
  const official = sp.get('official')
  const sort = sp.get('sort') as SortKey | null
  const page = Math.floor(Number(sp.get('page') ?? '1'))
  return {
    q: sp.get('q') ?? '',
    types: list('type'),
    lessons: list('lesson'),
    official: official === 'official' ? true : official === 'fan' ? false : null,
    sort: sort && SORT_KEYS.includes(sort) ? sort : 'relevance',
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    set: sp.get('set') ?? undefined,
  }
}

export function toURLSearchParams(
  record: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(record)) {
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x))
    else if (v != null) p.set(k, v)
  }
  return p
}

export function toSearchOptions(state: SearchState): { query: string; options: SearchOptions } {
  const filters: CardFilters = {}
  if (state.types.length) filters.types = state.types
  if (state.lessons.length) filters.lesson = state.lessons
  if (state.official !== null) filters.isOfficial = state.official
  if (state.set) filters.setCode = [state.set]
  return {
    query: state.q,
    options: {
      filters,
      sort: state.sort === 'relevance' ? undefined : [SORT_MEILI[state.sort]],
      page: state.page,
      hitsPerPage: HITS_PER_PAGE,
    },
  }
}

export function withParams(
  current: URLSearchParams,
  patch: Record<string, string | string[] | null>,
): URLSearchParams {
  const next = new URLSearchParams(current.toString())
  for (const [k, v] of Object.entries(patch)) {
    next.delete(k)
    if (Array.isArray(v)) v.forEach((x) => next.append(k, x))
    else if (v !== null && v !== '') next.set(k, v)
  }
  // Any change other than paging returns to page 1.
  if (Object.keys(patch).some((k) => k !== 'page')) next.delete('page')
  return next
}
