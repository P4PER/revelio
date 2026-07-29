import * as React from 'react'

import { cn } from '@/lib/utils'

// A compact segmented filter: joined 32px toggle buttons in one bordered well.
// Wraps onto extra rows when it can't fit a single line, so no segment is ever
// clipped or hidden behind a scrollbar. Shared by the lesson and card-type
// filters so they read as a single family.
function Segmented({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="group"
      className={cn(
        'flex max-w-full flex-wrap overflow-hidden rounded-lg border border-input bg-input-fill',
        className,
      )}
      {...props}
    />
  )
}

function SegmentedItem({
  active,
  className,
  ...props
}: React.ComponentProps<'button'> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'flex h-8 shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-2.5 text-sm font-medium whitespace-nowrap transition-colors last:border-r-0',
        className,
      )}
      {...props}
    />
  )
}

export { Segmented, SegmentedItem }
