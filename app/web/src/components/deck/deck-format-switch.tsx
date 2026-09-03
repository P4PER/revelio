'use client'
import { useTranslations } from 'next-intl'
import type { DeckFormat } from '@revelio/core'
import { cn } from '@/lib/utils'

const FORMATS: DeckFormat[] = ['classic', 'revival']

// The selected/unselected treatment of a segment, shared with the builder's
// pane switch below md. The two controls differ in shape - a pill against a
// full-width bar - but the gold fill marking the live half has to stay
// identical, or they read as two different kinds of setting.
export const SEGMENT_SELECTED = 'bg-gradient-to-b from-primary to-primary/80 text-primary-foreground'
export const SEGMENT_UNSELECTED = 'text-muted-foreground hover:text-foreground'

// Segmented Classic/Revival control for the builder's command bar. The gold
// fill on the selected half is deliberate: the format decides which pool the
// browser searches and which cards count as legal, so it reads as a live
// setting rather than as chrome.
//
// Height is pinned to h-8 rather than left to padding, so it lands on exactly
// the 32px the Import and Export buttons beside it use - padding alone put it
// two pixels proud of them.
//
// Presentational - the builder owns the format on BuilderState and hands it
// down; the deck panel only reads the consequence, in its legality bar.
export function DeckFormatSwitch({
  value,
  onChange,
  className,
}: {
  value: DeckFormat
  onChange: (format: DeckFormat) => void
  className?: string
}) {
  const t = useTranslations('decks')

  return (
    <div
      role="group"
      aria-label={t('format.label')}
      className={cn(
        'inline-flex h-8 shrink-0 items-center rounded-full border border-input bg-muted p-0.5',
        className,
      )}
    >
      {FORMATS.map((f) => (
        <button
          key={f}
          type="button"
          aria-pressed={value === f}
          onClick={() => onChange(f)}
          className={cn(
            'flex h-full cursor-pointer items-center rounded-full px-3 text-sm font-medium whitespace-nowrap transition',
            value === f ? SEGMENT_SELECTED : SEGMENT_UNSELECTED,
          )}
        >
          {t(`format.${f}`)}
        </button>
      ))}
    </div>
  )
}
