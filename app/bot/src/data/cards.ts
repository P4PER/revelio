import type { MeiliSearch } from 'meilisearch'
import { searchCards, type CardFilters, type SearchDocument } from '@revelio/search'
import { getCardById, type DB } from '@revelio/db'

export const DEFAULT_PAGE_SIZE = 10

export type CardPage = {
  hits: SearchDocument[]
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

export async function findCards(meili: MeiliSearch, input: CardSearchInput): Promise<CardPage> {
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE
  const page = Math.max(1, Math.floor(input.page ?? 1))
  const res = await searchCards(meili, input.locale, input.query, {
    filters: input.filters,
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

export type CardRuling = { date: string | null; source: string | null; text: string }

// Rulings carry one text per language. Prefer the reader's language, fall back
// to the card's default, then to any translation that exists; a ruling with no
// text at all is dropped rather than rendered as an empty bullet.
export async function getCardRulings(
  db: DB,
  cardId: string,
  locale: string,
): Promise<CardRuling[]> {
  const card = await getCardById(db, cardId, locale)
  if (!card) return []
  const out: CardRuling[] = []
  for (const r of card.rulings) {
    const text = r.text[locale] ?? r.text[card.defaultLanguage] ?? Object.values(r.text)[0]
    if (!text) continue
    out.push({ date: r.date, source: r.source, text })
  }
  return out
}
