'use client'
import { useTranslations } from 'next-intl'
import type { DeckCardView } from '@revelio/core'

const BUCKET_LABELS = ['0', '1', '2', '3', '4', '5+']

// Cards with no printed cost (e.g. lessons) fall into the "0" bucket; anything
// costing 5 or more is folded into the final "5+" bucket.
function bucketIndex(cost: number | null): number {
  const c = cost ?? 0
  return Math.min(BUCKET_LABELS.length - 1, Math.max(0, c))
}

// Pure render: buckets the deck's main-zone cards by cost and draws a bar chart.
// Caller passes only the main-zone entries (sideboard/character are irrelevant here).
export function LessonCurve({ entries }: { entries: DeckCardView[] }) {
  const t = useTranslations('decks')
  const counts = BUCKET_LABELS.map(() => 0)
  for (const e of entries) counts[bucketIndex(e.cost)] += e.quantity
  const max = Math.max(1, ...counts)

  return (
    <div role="group" aria-label={t('curve.ariaLabel')}>
      <div className="flex h-14 items-end gap-1.5">
        {counts.map((count, i) => (
          <div
            key={i}
            data-testid="curve-bar"
            className="relative min-h-1 flex-1 rounded-t-sm bg-gradient-to-b from-accent to-secondary"
            style={{ height: `${Math.max(4, Math.round((count / max) * 100))}%` }}
          >
            <span className="absolute inset-x-0 -top-4 text-center text-[0.6rem] tabular-nums text-muted-foreground">
              {count}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {BUCKET_LABELS.map((label) => (
          <span key={label} className="flex-1 text-center text-[0.6rem] text-muted-foreground">
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
