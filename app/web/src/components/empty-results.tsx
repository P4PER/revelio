import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { VanishedCard, type VanishedCardSize } from '@/components/vanished-card'

// The in-page sibling of ErrorCardState: same vanished-card motif, same
// vertical rhythm, one size down and headed by an h2 because it renders
// inside a page that already owns an h1. `compact` exists for the deck
// builder's browse rail, the only container narrow enough that the default
// would crowd the grid it replaces.
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
    <div
      role="status"
      className={cn('flex flex-col items-center justify-center px-6 text-center', s.pad, className)}
    >
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
