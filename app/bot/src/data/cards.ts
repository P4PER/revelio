import type { MeiliSearch } from 'meilisearch'
import {
  searchCardBrowseRows,
  searchCardSuggestions,
  searchCards,
  type CardBrowseHit,
  type CardFilters,
  type SearchDocument,
} from '@revelio/search'
import { getCardRulings, type DB } from '@revelio/db'

export type CardRuling = { date: string | null; source: string | null; text: string }

export type CardPage = {
  hits: CardBrowseHit[]
  total: number
  page: number
  pageSize: number
  pages: number
}

export type CardSearchInput = {
  query: string
  locale: string
  filters?: CardFilters
  page?: number
  pageSize?: number
}

export type CardSuggestion = { id: string; label: string }

// Five rows with thumbnails keep the browser at 35 of Discord's 40 components.
export const DEFAULT_PAGE_SIZE = 5

// Discord's hard ceilings for an autocomplete response. Exceeding either one
// makes the whole suggestion list silently disappear for the user.
export const MAX_CHOICES = 25
const MAX_LABEL = 100
// The site's "number" and "name" sorts (web/src/lib/search-params.ts). With no
// words to rank by, Meilisearch would return index order: a set browses #1,
// #2, ..., and anything wider by name, since numbers restart in every set.
// links.ts browseUrl mirrors this choice for the site link.
const NUMBER_SORT = 'numberSort:asc'
const NAME_SORT = 'name:asc'

function browseSort(input: CardSearchInput): string[] | undefined {
  if (input.query.trim()) return undefined
  return [input.filters?.setCode?.length ? NUMBER_SORT : NAME_SORT]
}

export function clampLabel(value: string): string {
  return value.length <= MAX_LABEL ? value : `${value.slice(0, MAX_LABEL - 1)}…`
}

// Reads browse rows (identity, thumbnail and stats fields) rather than whole
// documents - see searchCardBrowseRows.
export async function findCards(meili: MeiliSearch, input: CardSearchInput): Promise<CardPage> {
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE
  const page = Math.max(1, Math.floor(input.page ?? 1))
  const res = await searchCardBrowseRows(meili, input.locale, input.query, {
    filters: input.filters,
    sort: browseSort(input),
    page,
    hitsPerPage: pageSize,
  })
  // At least one page even when empty, so "page 1 of 1" reads sensibly rather
  // than "page 1 of 0". Note `res.total` is Meilisearch's estimatedTotalHits,
  // not an exact count, so `pages` is an upper bound: a page within it can still
  // return no hits. Callers must handle an empty `hits` on an in-range page.
  const pages = Math.max(1, Math.ceil(res.total / pageSize))
  return { hits: res.hits, total: res.total, page, pageSize, pages }
}

export async function findOneCard(
  meili: MeiliSearch,
  input: { query: string; locale: string },
): Promise<SearchDocument | null> {
  const res = await searchCards(meili, input.locale, input.query, { hitsPerPage: 1 })
  return res.hits[0] ?? null
}

// Rulings carry one text per language. Prefer the reader's language, fall back
// to the card's default, then to any translation that exists; a ruling with no
// text at all is dropped rather than rendered as an empty bullet.
export async function resolveCardRulings(
  db: DB,
  cardId: string,
  locale: string,
): Promise<CardRuling[]> {
  const card = await getCardRulings(db, cardId)
  if (!card) return []
  const out: CardRuling[] = []
  for (const r of card.rulings) {
    const text = r.text[locale] ?? r.text[card.defaultLanguage] ?? Object.values(r.text)[0]
    if (!text) continue
    out.push({ date: r.date, source: r.source, text })
  }
  return out
}

// Autocomplete cannot be deferred and must answer inside 3 seconds, so this is
// deliberately one Meilisearch call and nothing else.
export async function suggestCards(
  meili: MeiliSearch,
  input: { query: string; locale: string },
): Promise<CardSuggestion[]> {
  const query = input.query.trim()
  if (!query) return []
  const hits = await searchCardSuggestions(meili, input.locale, query, MAX_CHOICES)
  return hits.slice(0, MAX_CHOICES).map((hit) => ({
    id: hit.id,
    label: clampLabel(`${hit.name} (${hit.setCode} #${hit.number})`),
  }))
}

// A chosen suggestion submits the card id, so this resolves it exactly instead
// of running a second text search that a longer name could win. It filters
// rather than calling getDocument because the bot holds the read-only search
// key, and Meilisearch scopes that to the `search` action alone: documents.get
// answers 403, which would silently kill the fast path everywhere but a
// master-key dev stack. `id` is already a filterable attribute.
export async function findCardById(
  meili: MeiliSearch,
  id: string,
  locale: string,
): Promise<SearchDocument | null> {
  const trimmed = id.trim()
  if (!trimmed) return null
  const res = await searchCards(meili, locale, '', {
    filters: { ids: [trimmed] },
    hitsPerPage: 1,
  })
  return res.hits[0] ?? null
}
