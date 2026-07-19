import type { SearchDocument } from '@revelio/search'
import { imageUrl, thumbKey } from '@revelio/core'
import type { CollectionCard } from '@/components/collection-card-tile'

// Adapt a Meili search hit to the collection tile's minimal shape. The single
// place ownership grids turn a hit into a renderable card.
export function toCollectionCards(hits: SearchDocument[], base: string): CollectionCard[] {
  return hits.map((h) => ({
    id: h.id,
    name: h.name,
    finishes: h.finishes ?? ['normal'],
    orientation: h.orientation,
    src: h.imageLang ? imageUrl(base, thumbKey(h.id, h.imageVersion!, h.imageLang, h.defaultLanguage)) : undefined,
  }))
}
