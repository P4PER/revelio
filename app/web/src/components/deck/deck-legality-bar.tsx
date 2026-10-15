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
  // Scrolls the deck panel to the row a reason is about. The code tells the
  // panel which of the card's rows that is. Absent in the overview's gallery
  // view, which has no rows, and the names are then plain text.
  onJump?: (cardId: string, code: Violation['code']) => void
  className?: string
}

// Slim progress-bar + status-label legality indicator. Shared by the deck panel
// (builder) and the deck overview so both read the same whole-deck legality: the
// bar fills toward the 60-card main target and recolors with the status. When
// the deck has problems, the label toggles the list of every reason; the list
// opens by itself when the deck becomes illegal or overfills its main deck.
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
  // Overfilling the main deck isn't a "hard" violation in evaluateDeck (status
  // stays 'incomplete'), but it's a clear error - surface it in red here.
  const over = mainCount > MAIN_TARGET
  const red = status === 'illegal' || over
  // What the user did with the toggle; null means follow the default, which is
  // open only while the bar is red. A change of status drops the choice, so a
  // collapsed list stays shut while the deck stays illegal, even as its
  // reasons change, and opens again once the deck leaves illegal and comes
  // back. Going over 60 reopens a collapsed list but never closes one the user
  // opened, and dropping back to 60 leaves the choice alone. A deck still being
  // built (incomplete, at or under 60) stays closed until asked.
  const [choice, setChoice] = useState<boolean | null>(null)
  const [seen, setSeen] = useState({ status, over })
  if (status !== seen.status || over !== seen.over) {
    setSeen({ status, over })
    if (status !== seen.status) setChoice(null)
    else if (over && choice === false) setChoice(null)
  }
  const open = choice ?? red
  const listId = useId()
  const pct = Math.min(100, Math.round((mainCount / MAIN_TARGET) * 100))
  const ui = over ? STATUS_UI.illegal : STATUS_UI[status]
  const hasReasons = violations.length > 0
  // The count says why the deck is illegal, so it leaves out the soft reasons
  // (deck size, no character yet) the list still shows with a muted marker.
  const hardCount = violations.filter(isHardViolation).length
  const label =
    status === 'illegal' && hardCount > 0
      ? t('status.illegalIssues', { count: hardCount })
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
                          // A tooltip, not aria-label: the label would replace the
                          // name mid-sentence for a screen reader.
                          title={t('panel.jumpToCard', { name: String(values.name) })}
                          onClick={() => onJump(cardId, v.code)}
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
