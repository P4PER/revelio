import type { SearchDocument } from '@revelio/search'
import { CardTile } from './card-tile'

export function CardGrid({
  hits, imageBase, searchParams, startIndex = 0,
}: {
  hits: SearchDocument[]
  imageBase: string
  searchParams?: URLSearchParams
  startIndex?: number
}) {
  if (hits.length === 0) {
    return <p className="py-16 text-center text-muted-foreground" role="status">No cards found.</p>
  }
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {hits.map((hit, i) => (
        <li key={hit.id}>
          <CardTile
            hit={hit}
            imageBase={imageBase}
            context={searchParams ? { params: searchParams, index: startIndex + i } : undefined}
          />
        </li>
      ))}
    </ul>
  )
}
