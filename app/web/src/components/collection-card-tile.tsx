'use client'
import { Link } from '@/../i18n/navigation'
import { CardRotate } from '@/components/card-rotate'
import { Badge } from '@/components/ui/badge'
import { CardFinishStepper } from '@/components/card-finish-stepper'
import { attrLabel } from '@/lib/attribute-labels'
import { cn } from '@/lib/utils'

export type CollectionCard = {
  id: string
  name: string
  finishes: string[]
  orientation?: string | null
  src?: string // full thumbnail URL; undefined when the card has no image
}

export function CollectionCardTile({
  card, quantities, editable, locale = 'en',
}: {
  card: CollectionCard
  quantities: Record<string, number>
  editable: boolean
  locale?: string
}) {
  const total = Object.values(quantities).reduce((a, b) => a + b, 0)
  const owned = total > 0

  return (
    <div data-testid={`card-tile-${card.id}`} data-owned={owned} className="group relative">
      <Link href={`/card/${card.id}`} className="block">
        <figure className="rounded-lg border border-border/60 bg-card">
          {/* The gray-out for unowned cards lives on the image (via CardRotate's
              className), NOT this container: a filter/opacity ancestor becomes the
              containing block for position:fixed, which would trap and clip
              CardRotate's rotated (fixed) image inside this overflow-hidden box. */}
          <div className="relative aspect-[5/7] overflow-hidden rounded-t-lg bg-muted">
            {card.src ? (
              <CardRotate src={card.src} alt={card.name} orientation={card.orientation}
                sizes="(max-width: 640px) 45vw, 200px"
                idleClassName={cn(!owned && 'opacity-45 grayscale')} />
            ) : (
              <div className={cn('flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground', !owned && 'opacity-60')}>
                {card.name}
              </div>
            )}
          </div>
          <figcaption className="truncate px-2 py-1 text-sm">{card.name}</figcaption>
        </figure>
      </Link>
      {owned && (
        <Badge data-testid={`owned-badge-${card.id}`} className="absolute right-1.5 top-1.5 shadow">
          {total}
        </Badge>
      )}
      {editable && (
        <div className="pointer-events-none absolute inset-x-1 bottom-8 flex flex-col gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
          {card.finishes.map((f) => (
            <CardFinishStepper key={f} cardId={card.id} finish={f}
              label={attrLabel('finishes', f, locale)} quantity={quantities[f] ?? 0} />
          ))}
        </div>
      )}
    </div>
  )
}
