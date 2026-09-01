import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { VanishedCard, type VanishedCardSize } from '@/components/vanished-card'

// The in-page sibling of ErrorCardState: same vanished-card motif, same
// vertical rhythm, one size down and headed by an h2 because it renders
// inside a page that already owns an h1. `compact` exists for the deck
// builder's browse rail, the only container narrow enough that the default
// would crowd the grid it replaces.
//
// Deliberately NOT a live region: the list's own result count is, and marking
// both meant screen readers got two announcements for one navigation. The
// count is the better of the two -- it stays mounted across the update, where
// this state is only inserted, and "0 cards" says what happened more precisely
// than the heading does. The recovery button inside is reached by navigating
// the state, not by hearing it announced.
//
// So every list that can reach this state owes itself a count: ResultCount on
// /search and on both collection tabs, the count span on /decks, the count row
// in the deck builder. The one caller without one is /sets/[code], which
// states its total in the page header instead and is a full route change
// rather than an in-place update.
const SIZES: Record<
  'default' | 'compact',
  { motif: VanishedCardSize; pad: string; gap: string; heading: string; desc: string; actions: string }
> = {
  default: {
    motif: 'md',
    pad: 'py-14',
    gap: 'mb-6',
    heading: 'text-lg',
    desc: 'mt-2 max-w-sm text-sm',
    actions: 'mt-6',
  },
  compact: {
    motif: 'sm',
    pad: 'py-10',
    gap: 'mb-4',
    heading: 'text-base',
    desc: 'mt-1 max-w-xs text-sm',
    actions: 'mt-4',
  },
}

export function EmptyResults({
  size = 'default',
  heading,
  description,
  className,
  children,
}: {
  size?: 'default' | 'compact'
  heading: string
  description?: string
  className?: string
  children?: ReactNode
}) {
  const s = SIZES[size]
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 text-center', s.pad, className)}>
      <VanishedCard variant="missing" size={s.motif} className={s.gap} />
      <h2 className={cn('font-semibold text-foreground', s.heading)}>{heading}</h2>
      {description ? (
        <p className={cn('text-muted-foreground', s.desc)}>{description}</p>
      ) : null}
      {children ? (
        <div className={cn('flex flex-wrap items-center justify-center gap-3', s.actions)}>
          {children}
        </div>
      ) : null}
    </div>
  )
}
