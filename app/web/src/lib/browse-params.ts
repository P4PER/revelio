import type { DeckFormat } from '@revelio/core'
import type { PublicDeckSort } from '@revelio/db'

export type BrowseState = {
  q: string
  lessons: string[]
  format: DeckFormat | null
  sort: PublicDeckSort
  page: number
}

const SORTS: PublicDeckSort[] = ['likes', 'views', 'newest', 'updated']
const FORMATS: DeckFormat[] = ['classic', 'revival']

export function parseBrowseParams(sp: URLSearchParams): BrowseState {
  const lessons = sp.getAll('lesson').flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean)
  const sort = sp.get('sort') as PublicDeckSort | null
  const format = sp.get('format') as DeckFormat | null
  const page = Math.floor(Number(sp.get('page') ?? '1'))
  return {
    q: sp.get('q') ?? '',
    lessons,
    format: format && FORMATS.includes(format) ? format : null,
    sort: sort && SORTS.includes(sort) ? sort : 'likes',
    page: Number.isFinite(page) && page >= 1 ? page : 1,
  }
}

// Serializes only non-default state so shared URLs stay clean.
export function browseToQuery(state: Partial<BrowseState>): Record<string, string> {
  const out: Record<string, string> = {}
  if (state.q) out.q = state.q
  if (state.lessons && state.lessons.length) out.lesson = state.lessons.join(',')
  if (state.format) out.format = state.format
  if (state.sort && state.sort !== 'likes') out.sort = state.sort
  if (state.page && state.page > 1) out.page = String(state.page)
  return out
}
