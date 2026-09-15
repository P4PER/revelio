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
      {/* The p override in mdx-components.tsx carries its own size and measure
          and wins over this wrapper, so both are pinned here rather than
          inherited. */}
      <div className="text-sm leading-relaxed text-foreground [&>p]:m-0 [&>p]:max-w-none [&>p]:text-sm [&>p]:text-foreground">
        {children}
      </div>
    </div>
  )
}
