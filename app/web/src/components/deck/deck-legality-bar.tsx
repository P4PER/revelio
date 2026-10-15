'use client'
import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import { isHardViolation, type DeckStatus, type Violation } from '@revelio/core'
import { cn } from '@/lib/utils'
import { MAIN_TARGET, STATUS_UI, deckStatusText } from '@/lib/deck-legality'
import { violationMessage } from '@/lib/deck-violations'

type DeckLegalityBarProps = {
  status: DeckStatus
  mainCount: number
  hasCharacter: boolean
  violations?: Violation[]
  names?: Record<string, string>
  // Scrolls the deck panel to a card's row. Absent where there is no row to
  // go to (the overview's gallery view), and the names are then plain text.
  onJump?: (cardId: string) => void
  className?: string
}

// Slim progress-bar + status-label legality indicator. Shared by the deck panel
// (builder) and the deck overview so both read the same whole-deck legality: the
// bar fills toward the 60-card main target and recolors with the status. When
// the deck has problems, the label toggles the list of every reason; the list
// opens by itself when the deck becomes illegal.
export function DeckLegalityBar({
  status,
  mainCount,
  hasCharacter,
  violations = [],
  names = {},
  onJump,
  className,
}: DeckLegalityBarProps) {
  const t = useTranslations('decks')
  // What the user did with the toggle since the status last changed; null
  // means follow the default, which is open only for an illegal deck. A new
  // status drops the choice, so a deck that breaks a rule again reopens even
  // if the list was collapsed last time, while a deck still being built
  // (incomplete) stays closed until asked.
  const [choice, setChoice] = useState<boolean | null>(null)
  const [seenStatus, setSeenStatus] = useState(status)
  if (status !== seenStatus) {
    setSeenStatus(status)
    setChoice(null)
  }
  const open = choice ?? status === 'illegal'
  const listId = useId()
  const pct = Math.min(100, Math.round((mainCount / MAIN_TARGET) * 100))
  // Overfilling the main deck isn't a "hard" violation in evaluateDeck (status
  // stays 'incomplete'), but it's a clear error - surface it in red here.
  const ui = mainCount > MAIN_TARGET ? STATUS_UI.illegal : STATUS_UI[status]
  const hasReasons = violations.length > 0
  const label =
    status === 'illegal' && hasReasons
      ? t('status.illegalIssues', { count: violations.length })
      : deckStatusText(status, mainCount, hasCharacter, t)

  return (
    <div className={className}>
      <div className="flex items-center gap-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div className={cn('h-full rounded-full transition-all', ui.fill)} style={{ width: `${pct}%` }} />
        </div>
        {hasReasons ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setChoice(!open)}
            className={cn(
              '-my-0.5 -mr-1 flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              ui.text,
            )}
          >
            <span className={cn('size-1.5 rounded-full', ui.dot)} aria-hidden />
            {label}
            <ChevronDown
              className={cn('size-3.5 transition-transform motion-reduce:transition-none', open && 'rotate-180')}
              aria-hidden
            />
          </button>
        ) : (
          <span className={cn('flex shrink-0 items-center gap-1.5 text-xs font-medium', ui.text)}>
            <span className={cn('size-1.5 rounded-full', ui.dot)} aria-hidden />
            {label}
          </span>
        )}
      </div>
      {hasReasons && open && (
        <ul id={listId} className="mt-2.5 space-y-1 text-sm">
          {violations.map((v, i) => {
            const hard = isHardViolation(v)
            const { key, values } = violationMessage(v, names)
            const cardId = 'cardId' in v ? v.cardId : null
            return (
              <li key={`${v.code}-${cardId ?? i}`} className="flex items-baseline gap-2">
                <span
                  aria-hidden
                  className={cn('w-3 shrink-0 text-center font-bold', hard ? 'text-destructive' : 'text-muted-foreground')}
                >
                  {hard ? '!' : '·'}
                </span>
                {/* The sentence is muted so the card name, in full-strength
                    semibold, is what the eye lands on. */}
                <span className="min-w-0 text-muted-foreground">
                  {t.rich(key, {
                    ...values,
                    card: (chunks) => {
                      const name = <strong className="font-semibold text-foreground">{chunks}</strong>
                      return onJump && cardId ? (
                        <button
                          type="button"
                          aria-label={t('panel.jumpToCard', { name: String(values.name) })}
                          onClick={() => onJump(cardId)}
                          className="cursor-pointer rounded-sm underline decoration-foreground/45 decoration-dotted underline-offset-3 hover:decoration-current hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        >
                          {name}
                        </button>
                      ) : (
                        name
                      )
                    },
                  })}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
