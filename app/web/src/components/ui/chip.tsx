import * as React from 'react'

import { cn } from '@/lib/utils'

// A standalone 32px filter chip: a self-bordered pressable toggle that wraps
// like a tag when a row of them can't fit one line. Because each chip owns its
// border inside its own height (border-box), a chip lines up flush with the
// other 32px toolbar controls (e.g. the Advanced button) with no wrapper adding
// stray pixels. Shared by the type and lesson filters so they read as one
// family. Callers style the active state via className (or inline style, for the
// lesson colours), which wins over the neutral resting border below.
function Chip({
  active,
  className,
  ...props
}: React.ComponentProps<'button'> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-input px-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  )
}

export { Chip }
