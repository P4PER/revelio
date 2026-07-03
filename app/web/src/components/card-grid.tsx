import type { SearchDocument } from '@revelio/search'
import { CardTile } from './card-tile'

export function CardGrid({ hits, imageBase }: { hits: SearchDocument[]; imageBase: string }) {
  if (hits.length === 0) {
    return <p className="py-16 text-center text-muted-foreground" role="status">No cards found.</p>
  }
  return (
    <ul className="grid grid-cols-4 gap-4">
      {hits.map((hit) => (
        <li key={hit.id}>
          <CardTile hit={hit} imageBase={imageBase} />
        </li>
      ))}
    </ul>
  )
}
