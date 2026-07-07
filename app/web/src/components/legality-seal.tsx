'use client'
import { useTranslations } from 'next-intl'
import type { DeckStatus, Violation } from '@revelio/core'
import { cn } from '@/lib/utils'

const MAIN_TARGET = 60

const STATUS_STYLE: Record<DeckStatus, { ring: string; dot: string; pill: string }> = {
  legal: { ring: 'text-chart-4', dot: 'bg-chart-4', pill: 'bg-chart-4/10 text-chart-4' },
  incomplete: { ring: 'text-primary', dot: 'bg-primary', pill: 'bg-primary/10 text-primary' },
  illegal: { ring: 'text-destructive', dot: 'bg-destructive', pill: 'bg-destructive/10 text-destructive' },
}

function violationText(
  v: Violation,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  switch (v.code) {
    case 'no_character':
    case 'multiple_characters':
      return t(`violation.${v.code}`)
    case 'invalid_character':
      return t('violation.invalid_character', { cardId: v.cardId })
    case 'main_deck_size':
      return t('violation.main_deck_size', { actual: v.actual })
    case 'sideboard_too_large':
      return t('violation.sideboard_too_large', { actual: v.actual })
    case 'too_many_copies':
      return t('violation.too_many_copies', { cardId: v.cardId, count: v.count })
    case 'card_not_in_format':
      return t('violation.card_not_in_format', { cardId: v.cardId })
    case 'banned_card':
      return t('violation.banned_card', { cardId: v.cardId })
  }
}

// The deck's signature gauge: a conic-gradient ring that fills toward the 60-card
// main deck target and recolors with the deck's legality status, paired with a
// status pill. Presentational only — evaluateDeck() does the actual legality math.
export function LegalitySeal({
  status,
  mainCount,
  violations,
}: {
  status: DeckStatus
  mainCount: number
  violations: Violation[]
}) {
  const t = useTranslations('decks')
  const style = STATUS_STYLE[status]
  const pct = Math.min(100, Math.round((mainCount / MAIN_TARGET) * 100))
  const statusText =
    status === 'legal'
      ? t('status.legal')
      : status === 'illegal'
        ? t('status.illegal')
        : mainCount < MAIN_TARGET
          ? t('status.incompleteNeeds', { count: MAIN_TARGET - mainCount })
          : t('status.incomplete')
  const violationLines = violations.map((v) => violationText(v, t))

  return (
    <div className="flex items-center gap-3">
      <div
        role="img"
        aria-label={t('seal.ariaLabel', { count: mainCount, total: MAIN_TARGET })}
        title={violationLines.length ? violationLines.join('\n') : undefined}
        className={cn('relative grid size-14 shrink-0 place-items-center rounded-full', style.ring)}
        style={{ background: `conic-gradient(currentColor ${pct}%, var(--muted) 0)` }}
      >
        <div className="absolute inset-1 rounded-full bg-card" aria-hidden />
        <div className="relative text-center leading-none text-foreground" aria-hidden>
          <b className="text-sm font-semibold tabular-nums">{mainCount}</b>
          <small className="mt-0.5 block text-[0.55rem] tracking-widest text-muted-foreground uppercase">
            /{MAIN_TARGET}
          </small>
        </div>
        <span className="sr-only">{`${mainCount} / ${MAIN_TARGET}`}</span>
      </div>
      <div className="flex flex-col gap-1">
        <span className={cn('inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold', style.pill)}>
          <span className={cn('size-2 rounded-full', style.dot)} aria-hidden />
          {statusText}
        </span>
        {violationLines.length > 0 && (
          <ul className="sr-only">
            {violationLines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
