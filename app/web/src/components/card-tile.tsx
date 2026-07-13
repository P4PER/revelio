import Image from 'next/image'
import { Link } from '@/../i18n/navigation'
import type { SearchDocument } from '@revelio/search'
import { imageKey, imageUrl, thumbKey } from '@revelio/core'
import { CardRotate } from '@/components/card-rotate'

export function CardTile({ hit, imageBase }: { hit: SearchDocument; imageBase: string }) {
  return (
    <Link href={`/card/${hit.id}`} className="block">
      <figure className="group rounded-lg border border-border/60 bg-card">
        <div data-card-frame className="relative aspect-[5/7] overflow-hidden rounded-t-lg bg-muted">
          {hit.imageLang ? (
            <>
              <Image
                src={imageUrl(imageBase, thumbKey(hit.id, hit.imageLang, hit.defaultLanguage))}
                alt={hit.name}
                fill
                sizes="(max-width: 640px) 45vw, 200px"
                className="object-cover transition group-hover:brightness-110"
              />
              <CardRotate
                src={imageUrl(imageBase, imageKey(hit.id, hit.imageLang, hit.defaultLanguage))}
                alt={hit.name}
                orientation={hit.orientation}
                sizes="400px"
              />
            </>
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
