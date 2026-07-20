import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type ErrorCardVariant = 'missing' | 'dissolving' | 'dark'

const VARIANTS: Record<ErrorCardVariant, { symbol: string; color: string }> = {
  missing: { symbol: '?', color: 'text-primary' },
  dissolving: { symbol: '✦', color: 'text-accent' },
  dark: { symbol: '✦', color: 'text-accent' },
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
  const { symbol, color } = VARIANTS[variant]
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-16 text-center">
      {/* Vanished card motif */}
      <div className="relative mb-6 inline-block">
        <div
          className={cn(
            'relative grid h-56 w-40 place-items-center overflow-hidden rounded-2xl border border-border',
            'shadow-[0_18px_42px_rgba(0,0,0,0.55)]',
            variant === 'dissolving' &&
              '[mask-image:linear-gradient(115deg,#000_55%,transparent_92%)]',
          )}
          style={{
            backgroundImage:
              'repeating-linear-gradient(135deg,#1d1942 0 9px,#191537 9px 18px)',
          }}
        >
          <div className="pointer-events-none absolute inset-4 rounded-lg border border-dashed border-[#3a3568]" />
          <span
            className={cn(
              'text-5xl [filter:drop-shadow(0_0_18px_rgba(232,178,58,0.5))]',
              color,
            )}
          >
            {symbol}
          </span>
        </div>
        <span className="absolute -left-3 -top-2 text-lg text-primary [filter:drop-shadow(0_0_8px_rgba(246,213,139,0.85))]">
          ✦
        </span>
      </div>

      <h1 className="text-xl font-semibold text-foreground">{heading}</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{children}</div>

      {digest ? (
        <p className="mt-4 font-mono text-xs text-muted-foreground/70">
          {digestLabel}: {digest}
        </p>
      ) : null}
    </main>
  )
}

export default ErrorCardState
