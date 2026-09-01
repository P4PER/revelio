import type { ReactNode } from 'react'
import { VanishedCard, type VanishedCardVariant } from '@/components/vanished-card'

export type ErrorCardVariant = VanishedCardVariant

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
  return (
    <main className="flex min-h-[75vh] flex-col items-center justify-center px-6 py-20 text-center">
      <VanishedCard variant={variant} size="lg" className="mb-8" />
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
