import type { MeiliSearch } from 'meilisearch'
import type { CardDetailDTO } from '@revelio/core'
import { MAX_TOTAL_HITS, searchCardIds } from '@revelio/search'
import { contextHref, parseSearchParams, toSearchOptions } from './search-params'

export type Neighbor = { id: string; href: string }
export type NeighborContext = { params: URLSearchParams; index: number }

// Sets are small (<= ~200 cards); 500 is a safe ceiling for the set-order walk.
const SET_WALK_LIMIT = 500

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
  ids: string[],
  currentId: string,
  index: number,
): { prevId: string | null; prevIndex: number; nextId: string | null; nextIndex: number } | null {
  const centerPos = index === 0 ? 0 : 1
  if (ids[centerPos] !== currentId) return null
  return {
    prevId: centerPos > 0 ? ids[centerPos - 1] ?? null : null, prevIndex: index - 1,
    nextId: ids[centerPos + 1] ?? null, nextIndex: index + 1,
  }
}

// Resolve prev/next for a card. With search context, walk the user's result set
// via a 3-wide window; otherwise (or if the index went stale) walk the card's
// own set ordered by numberSort. Both walks read ids only - card content is
// irrelevant here, and this runs on every card view plus its two prefetches.
export async function getCardNeighbors(
  client: MeiliSearch,
  locale: string,
  card: CardDetailDTO,
  ctx: NeighborContext | null,
): Promise<{ prev: Neighbor | null; next: Neighbor | null }> {
  // Beyond maxTotalHits Meilisearch returns an empty window, which reads as a
  // stale index; skip the pointless request and go straight to set order.
  if (ctx && ctx.index + 2 <= MAX_TOTAL_HITS) {
    const offset = Math.max(0, ctx.index - 1)
    const limit = ctx.index === 0 ? 2 : 3
    const { query, options } = toSearchOptions(parseSearchParams(ctx.params))
    const { ids } = await searchCardIds(client, locale, query, {
      filters: options.filters, sort: options.sort, offset, limit,
    })
    const w = neighborsFromWindow(ids, card.id, ctx.index)
    if (w) {
      return {
        prev: w.prevId ? { id: w.prevId, href: contextHref(w.prevId, ctx.params, w.prevIndex) } : null,
        next: w.nextId ? { id: w.nextId, href: contextHref(w.nextId, ctx.params, w.nextIndex) } : null,
      }
    }
    // stale index -> fall through to set order
  }

  const { ids } = await searchCardIds(client, locale, '', {
    filters: { setCode: [card.setCode] },
    sort: ['numberSort:asc'],
    offset: 0,
    limit: SET_WALK_LIMIT,
  })
  const idx = ids.indexOf(card.id)
  return {
    prev: idx > 0 ? { id: ids[idx - 1], href: `/card/${ids[idx - 1]}` } : null,
    next: idx >= 0 && idx < ids.length - 1 ? { id: ids[idx + 1], href: `/card/${ids[idx + 1]}` } : null,
  }
}

// Card navigation is a progressive enhancement, so it must not be able to take
// the detail page down with it: a missing MEILI_HOST (the factory throws) or a
// Meilisearch outage costs the chevrons, not the page. The client is resolved
// in here rather than by the caller so the factory's throw is caught too.
export async function getCardNeighborsSafe(
  getClient: () => MeiliSearch,
  locale: string,
  card: CardDetailDTO,
  ctx: NeighborContext | null,
): Promise<{ prev: Neighbor | null; next: Neighbor | null }> {
  try {
    return await getCardNeighbors(getClient(), locale, card, ctx)
  } catch (err) {
    console.error('card neighbors unavailable for card', card.id, err)
    return { prev: null, next: null }
  }
}
