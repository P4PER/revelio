import Image from 'next/image'
import type { SearchDocument } from '@revelio/search'
import { imageUrl, thumbKey } from '@revelio/core'

export function CardTile({ hit, imageBase }: { hit: SearchDocument; imageBase: string }) {
  return (
    <figure className="group overflow-hidden rounded-lg border border-border/60 bg-card">
      <div className="relative aspect-[5/7] bg-muted">
        {hit.imageFile ? (
          <Image
            src={imageUrl(imageBase, thumbKey(hit.id))}
            alt={hit.name}
            fill
            sizes="(max-width: 640px) 45vw, 200px"
            className="object-cover transition group-hover:brightness-110"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {hit.name}
          </div>
        )}
      </div>
      <figcaption className="truncate px-2 py-1 text-sm">{hit.name}</figcaption>
    </figure>
  )
}
