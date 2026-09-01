import { cn } from '@/lib/utils'

export type VanishedCardVariant = 'missing' | 'dissolving' | 'dark'
export type VanishedCardSize = 'lg' | 'md' | 'sm'

const VARIANTS: Record<
  VanishedCardVariant,
  { symbol: string; color: string; mask: boolean }
> = {
  missing: { symbol: '?', color: 'text-primary-ink', mask: false },
  dissolving: { symbol: '✦', color: 'text-secondary-ink', mask: true },
  dark: { symbol: '✦', color: 'text-secondary-ink', mask: false },
}

// One motif at three scales. `stripe` is the width in px of a single diagonal
// band; the gradient repeats at twice that. It shrinks with the card so the
// hatching keeps the same visual density instead of turning into a smear at
// the small sizes.
const SIZES: Record<
  VanishedCardSize,
  {
    card: string
    radius: string
    inset: string
    symbol: string
    sparkleTop: string
    sparkleBottom: string
    stripe: number
  }
> = {
  lg: {
    card: 'h-80',
    radius: 'rounded-2xl',
    inset: 'inset-4 rounded-lg',
    symbol: 'text-7xl',
    sparkleTop: '-left-3 -top-2 text-xl',
    sparkleBottom: '-bottom-1 -right-3 text-sm',
    stripe: 9,
  },
  md: {
    card: 'h-48',
    radius: 'rounded-xl',
    inset: 'inset-2.5 rounded-md',
    symbol: 'text-4xl',
    sparkleTop: '-left-2 -top-1.5 text-base',
    sparkleBottom: '-bottom-1 -right-2 text-xs',
    stripe: 6,
  },
  sm: {
    card: 'h-24',
    radius: 'rounded-lg',
    inset: 'inset-1.5 rounded-sm',
    symbol: 'text-2xl',
    sparkleTop: '-left-1.5 -top-1 text-xs',
    sparkleBottom: '-bottom-0.5 -right-1.5 text-[0.625rem]',
    stripe: 4,
  },
}

export function VanishedCard({
  variant,
  size = 'lg',
  className,
}: {
  variant: VanishedCardVariant
  size?: VanishedCardSize
  className?: string
}) {
  const { symbol, color, mask } = VARIANTS[variant]
  const s = SIZES[size]
  return (
    <div className={cn('relative inline-block', className)}>
      <div
        className={cn(
          'relative grid aspect-[5/7] place-items-center overflow-hidden border border-border',
          s.card,
          s.radius,
          // Light gets the scale's own shadow; dark keeps the original heavy
          // one, which is built for a midnight page and would be too much on
          // parchment.
          'shadow-xl dark:shadow-[0_18px_42px_rgba(0,0,0,0.55)]',
          mask && '[mask-image:linear-gradient(115deg,#000_55%,transparent_92%)]',
        )}
        style={{
          backgroundImage: `repeating-linear-gradient(135deg,var(--color-muted) 0 ${s.stripe}px,var(--color-card) ${s.stripe}px ${s.stripe * 2}px)`,
        }}
      >
        <div
          className={cn(
            'pointer-events-none absolute border border-dashed border-border',
            s.inset,
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            '[filter:drop-shadow(0_0_18px_var(--glow-symbol))]',
            s.symbol,
            color,
          )}
        >
          {symbol}
        </span>
      </div>
      <span
        aria-hidden="true"
        className={cn(
          'absolute text-primary-ink [filter:drop-shadow(0_0_8px_var(--glow-sparkle))]',
          s.sparkleTop,
        )}
      >
        {'✦'}
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'absolute text-primary-ink [filter:drop-shadow(0_0_6px_var(--glow-sparkle-sm))]',
          s.sparkleBottom,
        )}
      >
        {'✦'}
      </span>
    </div>
  )
}
