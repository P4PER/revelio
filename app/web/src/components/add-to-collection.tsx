'use client'
import { useTranslations } from 'next-intl'
import { Library } from 'lucide-react'
import { CardFinishStepper } from '@/components/card-finish-stepper'
import { attrLabel } from '@/lib/attribute-labels'
import { cn } from '@/lib/utils'

// Always-visible collection panel shown under the card image on the detail page:
// a header (label + owned total) over borderless per-finish steppers — no
// popover, no gold outlines, no dividers between the steppers.
export function AddToCollection({
  cardId, finishes, quantities, locale, className,
}: {
  cardId: string
  finishes: string[]
  quantities: Record<string, number>
  locale: string
  className?: string
}) {
  const t = useTranslations('collection')
  const total = Object.values(quantities).reduce((a, b) => a + b, 0)

  return (
    <div className={cn('overflow-hidden rounded-xl border border-input bg-card', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Library className="size-3.5" />
          {total > 0 ? t('inCollection') : t('addToCollection')}
        </span>
        {total > 0 && (
          <span className="text-xs font-bold tabular-nums text-white">{t('copies', { count: total })}</span>
        )}
      </div>
      <div className="flex flex-col gap-2 px-2.5 py-2">
        {finishes.map((f) => (
          <CardFinishStepper key={f} cardId={cardId} finish={f} variant="plain"
            label={attrLabel('finishes', f, locale)} quantity={quantities[f] ?? 0} />
        ))}
      </div>
    </div>
  )
}
