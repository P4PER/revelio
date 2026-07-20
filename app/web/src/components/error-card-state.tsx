import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ErrorCardVariant = 'missing' | 'dissolving' | 'dark'

const VARIANTS: Record<
  ErrorCardVariant,
  { symbol: string; color: string; mask: boolean }
> = {
  missing: { symbol: '?', color: 'text-primary', mask: false },
  dissolving: { symbol: '✦', color: 'text-accent', mask: true },
  dark: { symbol: '✦', color: 'text-accent', mask: false },
}

export function ErrorCardState({
  variant,
  heading,
  description,
  digest,
  digestLabel = 'reference',
  children,
}: {
  variant: ErrorCardVariant
  heading: string
  description: string
  digest?: string
  digestLabel?: string
  children: ReactNode
}) {
  const { symbol, color, mask } = VARIANTS[variant]
  return (
    <main className="flex min-h-[75vh] flex-col items-center justify-center px-6 py-20 text-center">
      {/* Vanished card motif */}
      <div className="relative mb-8 inline-block">
        <div
          className={cn(
            'relative grid aspect-[5/7] h-80 place-items-center overflow-hidden rounded-2xl border border-border',
            'shadow-[0_18px_42px_rgba(0,0,0,0.55)]',
            mask && '[mask-image:linear-gradient(115deg,#000_55%,transparent_92%)]',
          )}
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg,#1d1942 0 9px,#191537 9px 18px)',
          }}
        >
          <div className="pointer-events-none absolute inset-4 rounded-lg border border-dashed border-[#3a3568]" />
          <span
            aria-hidden="true"
            className={cn(
              'text-7xl [filter:drop-shadow(0_0_18px_rgba(232,178,58,0.5))]',
              color,
            )}
          >
            {symbol}
          </span>
        </div>
        <span
          aria-hidden="true"
          className="absolute -left-3 -top-2 text-xl text-primary [filter:drop-shadow(0_0_8px_rgba(246,213,139,0.85))]"
        >
          ✦
        </span>
        <span
          aria-hidden="true"
          className="absolute -bottom-1 -right-3 text-sm text-primary [filter:drop-shadow(0_0_6px_rgba(246,213,139,0.8))]"
        >
          ✦
        </span>
      </div>

      <h1 className="text-2xl font-semibold text-foreground">{heading}</h1>
      <p className="mt-3 max-w-md text-base text-muted-foreground">{description}</p>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">{children}</div>

      {digest ? (
        <p className="mt-5 font-mono text-xs text-muted-foreground/70">
          {digestLabel}: {digest}
        </p>
      ) : null}
    </main>
  )
}

export default ErrorCardState
