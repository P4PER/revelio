import { Link } from '@/../i18n/navigation'
import type { SearchDocument } from '@revelio/search'
import { imageUrl, thumbKey } from '@revelio/core'
import { CardRotate } from '@/components/card-rotate'

export function CardTile({ hit, imageBase }: { hit: SearchDocument; imageBase: string }) {
  return (
    <Link href={`/card/${hit.id}`} className="block">
      <figure className="group rounded-lg border border-border/60 bg-card">
        <div className="relative aspect-[5/7] overflow-hidden rounded-t-lg bg-muted">
          {hit.imageLang ? (
            <CardRotate
              src={imageUrl(imageBase, thumbKey(hit.id, hit.imageVersion!, hit.imageLang, hit.defaultLanguage))}
              alt={hit.name}
              orientation={hit.orientation}
              sizes="(max-width: 640px) 45vw, 200px"
              className="transition group-hover:brightness-110"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {hit.name}
            </div>
          )}
        </div>
        <figcaption className="truncate px-2 py-1 text-sm">{hit.name}</figcaption>
      </figure>
    </Link>
  )
}
