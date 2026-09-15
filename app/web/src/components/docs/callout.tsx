import type { ReactNode } from 'react'
import { Info } from 'lucide-react'

/**
 * An aside inside a docs page: the thing a reader needs but that would break
 * the flow of the section it belongs to. Deliberately one variant - a docs
 * section this size does not need a taxonomy of note, tip, warning and danger.
 */
export function Callout({ children }: { children: ReactNode }) {
  return (
    <div
      role="note"
      className="mt-6 flex max-w-[65ch] gap-3 rounded-xl border border-primary/45 bg-primary/8 px-4 py-3.5"
    >
      <Info className="mt-0.5 size-4 shrink-0 text-primary-ink" aria-hidden />
      <div className="text-sm leading-relaxed text-foreground [&>p]:m-0 [&>p]:text-foreground">
        {children}
      </div>
    </div>
  )
}
