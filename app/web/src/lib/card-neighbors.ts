import type { MeiliSearch } from 'meilisearch'
import type { CardDetailDTO } from '@revelio/core'
import { searchCards } from '@revelio/search'
import { contextHref, parseSearchParams, toSearchOptions } from './search-params'

export type Neighbor = { id: string; href: string }
export type NeighborContext = { params: URLSearchParams; index: number }

// Read the search context off the card URL. Present only when the link came
// from a result grid (`i` = the hit's absolute index in the result set).
export function parseNeighborContext(sp: URLSearchParams): NeighborContext | null {
  const raw = sp.get('i')
  if (raw == null) return null
  const i = Number(raw)
  if (!Number.isInteger(i) || i < 0) return null
  return { params: sp, index: i }
}

// Turn a 3-wide (or 2-wide at the first index) window fetched at offset
// max(0, index-1) into prev/next. Returns null if the window's center is not
// the current card - the result list changed since the link was built.
export function neighborsFromWindow(
  hits: { id: string }[],
  currentId: string,
  index: number,
): { prevId: string | null; prevIndex: number; nextId: string | null; nextIndex: number } | null {
  const centerPos = index === 0 ? 0 : 1
  if (hits[centerPos]?.id !== currentId) return null
  const prev = centerPos > 0 ? hits[centerPos - 1] : null
  const next = hits[centerPos + 1] ?? null
  return {
    prevId: prev?.id ?? null, prevIndex: index - 1,
    nextId: next?.id ?? null, nextIndex: index + 1,
  }
}

// Resolve prev/next for a card. With search context, walk the user's result set
// via a 3-wide window; otherwise (or if the index went stale) walk the card's
// own set ordered by numberSort.
export async function getCardNeighbors(
  client: MeiliSearch,
  locale: string,
  card: CardDetailDTO,
  ctx: NeighborContext | null,
): Promise<{ prev: Neighbor | null; next: Neighbor | null }> {
  if (ctx) {
    const offset = Math.max(0, ctx.index - 1)
    const limit = ctx.index === 0 ? 2 : 3
    const { query, options } = toSearchOptions(parseSearchParams(ctx.params))
    const res = await searchCards(client, locale, query, { ...options, window: { offset, limit } })
    const w = neighborsFromWindow(res.hits, card.id, ctx.index)
    if (w) {
      return {
        prev: w.prevId ? { id: w.prevId, href: contextHref(w.prevId, ctx.params, w.prevIndex) } : null,
        next: w.nextId ? { id: w.nextId, href: contextHref(w.nextId, ctx.params, w.nextIndex) } : null,
      }
    }
    // stale index -> fall through to set order
  }

  // Set-order fallback. Sets are small (<= ~200 cards); 500 is a safe ceiling.
  const res = await searchCards(client, locale, '', {
    filters: { setCode: [card.setCode] },
    sort: ['numberSort:asc'],
    hitsPerPage: 500,
  })
  const ids = res.hits.map((h) => h.id)
  const idx = ids.indexOf(card.id)
  return {
    prev: idx > 0 ? { id: ids[idx - 1], href: `/card/${ids[idx - 1]}` } : null,
    next: idx >= 0 && idx < ids.length - 1 ? { id: ids[idx + 1], href: `/card/${ids[idx + 1]}` } : null,
  }
}
