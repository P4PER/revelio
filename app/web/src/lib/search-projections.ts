import type { SearchDocument } from '@revelio/search'

// One tuple per surface, and the hit type derived from that same tuple. The tuple is
// what goes to Meilisearch as attributesToRetrieve, so a renderer that reads a field
// the query did not ask for fails to compile rather than reading undefined at runtime.
// This module is isomorphic on purpose - the deck browser is a client component and
// needs DeckBrowseHit, so it cannot live under lib/server.

// CardTile: the thumbnail (or the name as a fallback), the caption, and the link.
export const CARD_TILE_FIELDS = [
  'id', 'name', 'imageLang', 'imageVersion', 'defaultLanguage', 'orientation',
] as const

// The collection tiles add the finish badges on top of the plain tile.
export const COLLECTION_TILE_FIELDS = [...CARD_TILE_FIELDS, 'finishes'] as const

export type CardTileHit = Pick<SearchDocument, (typeof CARD_TILE_FIELDS)[number]>

export type CollectionTileHit = Pick<SearchDocument, (typeof COLLECTION_TILE_FIELDS)[number]>
