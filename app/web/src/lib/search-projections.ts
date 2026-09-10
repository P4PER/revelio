import type { CardProjection, SearchDocument } from '@revelio/search'

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

// The deck browser renders a tile and builds a DeckCardView from the hit, so it needs
// almost everything: only text, flavorText, rarity and numberSort are unused.
export const DECK_BROWSE_FIELDS = [
  'id', 'name', 'setCode', 'number', 'cost', 'damage', 'types', 'subTypes', 'lesson',
  'legality', 'isOfficial', 'orientation', 'imageLang', 'imageVersion',
  'defaultLanguage', 'artCropVersion',
] as const

export type CardTileHit = Pick<SearchDocument, (typeof CARD_TILE_FIELDS)[number]>

export type CollectionTileHit = Pick<SearchDocument, (typeof COLLECTION_TILE_FIELDS)[number]>

export type DeckBrowseHit = Pick<SearchDocument, (typeof DECK_BROWSE_FIELDS)[number]>

// The deck browser's paged result, shared by the server action that produces it and
// the client component that holds it in state.
export type DeckBrowseResult = CardProjection<(typeof DECK_BROWSE_FIELDS)[number]>
