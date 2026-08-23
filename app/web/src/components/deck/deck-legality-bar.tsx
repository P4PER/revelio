'use client'
import { useTranslations } from 'next-intl'
import type { DeckStatus } from '@revelio/core'
import { cn } from '@/lib/utils'
import { MAIN_TARGET, STATUS_UI, deckStatusText } from '@/lib/deck-legality'

// Slim progress-bar + status-label legality indicator. Shared by the deck panel
// (builder) and the deck overview so both read the same whole-deck legality: the
// bar fills toward the 60-card main target and recolors with the status.
export function DeckLegalityBar({
  status,
  mainCount,
  hasCharacter,
  className,
}: {
  status: DeckStatus
  mainCount: number
  hasCharacter: boolean
  className?: string
}) {
  const t = useTranslations('decks')
  const pct = Math.min(100, Math.round((mainCount / MAIN_TARGET) * 100))
  // Overfilling the main deck isn't a "hard" violation in evaluateDeck (status
  // stays 'incomplete'), but it's a clear error — surface it in red here.
  const ui = mainCount > MAIN_TARGET ? STATUS_UI.illegal : STATUS_UI[status]
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', ui.fill)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={cn('flex shrink-0 items-center gap-1.5 text-xs font-medium', ui.text)}>
        <span className={cn('size-1.5 rounded-full', ui.dot)} aria-hidden />
        {deckStatusText(status, mainCount, hasCharacter, t)}
      </span>
    </div>
  )
}
