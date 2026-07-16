import 'server-only'
import type { MeiliSearch } from 'meilisearch'
import type { DB } from '@revelio/db'
import type { SetDTO, SetProgress, CollectionSummary, OwnedQuantities } from '@revelio/core'
import { searchCards } from '@revelio/search'
import {
  listSets, getCollectionSetProgress, getCollectionSummary, getOwnedQuantities,
  getOwnedCardIds, getDuplicateCardIds,
} from '@revelio/db'
import { runSearch } from '@/lib/search-client'
import { parseSearchParams, toSearchOptions } from '@/lib/search-params'
import { parseOwnership, applyOwnership } from '@/lib/collection-search'
import { toCollectionCards } from '@/lib/collection-cards'
import type { CollectionCard } from '@/components/collection-card-tile'

export type CollectionPageData = {
  sets: SetDTO[]
  progress: SetProgress[]
  summary: CollectionSummary
  selectedSet: string
  tab: 'sets' | 'browse'
  setCards: CollectionCard[]
  browseCards: CollectionCard[]
  quantities: OwnedQuantities
}

// Shared data loader for both the owner (/collection) and public
// (/collection/[username]) views — computes a set progress dashboard plus the
// two card grids (selected set, and the ownership-filtered browse) for one owner.
export async function loadCollectionPage(
  db: DB, client: MeiliSearch, locale: string, ownerId: string,
  sp: URLSearchParams, imageBase: string,
): Promise<CollectionPageData> {
  const tab = sp.get('tab') === 'browse' ? 'browse' : 'sets'

  const [sets, progress, summary, ownedIds, dupeIds] = await Promise.all([
    listSets(db, locale),
    getCollectionSetProgress(db, ownerId),
    getCollectionSummary(db, ownerId),
    getOwnedCardIds(db, ownerId),
    getDuplicateCardIds(db, ownerId),
  ])

  const selectedSet = sp.get('set') ?? sets[0]?.code ?? ''

  const setRes = selectedSet
    ? await runSearch(client, locale, parseSearchParams(new URLSearchParams(`set=${selectedSet}`)))
    : { hits: [], total: 0, page: 1, hitsPerPage: 24 }

  const state = parseSearchParams(sp)
  const ownership = parseOwnership(sp)
  const { query, options } = toSearchOptions(state)
  const browseRes = await searchCards(client, locale, query, applyOwnership(options, ownership, ownedIds, dupeIds))

  const quantities = await getOwnedQuantities(
    db, ownerId, [...setRes.hits, ...browseRes.hits].map((h) => h.id),
  )

  return {
    sets, progress, summary, selectedSet, tab,
    setCards: toCollectionCards(setRes.hits, imageBase),
    browseCards: toCollectionCards(browseRes.hits, imageBase),
    quantities,
  }
}
