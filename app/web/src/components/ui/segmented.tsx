import * as React from 'react'

import { cn } from '@/lib/utils'

// A compact 32px segmented filter: joined toggle buttons in one bordered well.
// Scrolls rather than break the toolbar row when it can't fit. Shared by the
// lesson and card-type filters so they read as a single family.
function Segmented({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      role="group"
      className={cn(
        'flex h-8 max-w-full items-stretch overflow-x-auto rounded-lg border border-input bg-input-fill',
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
        'flex shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-2.5 text-sm font-medium whitespace-nowrap transition-colors last:border-r-0',
        className,
      )}
      {...props}
    />
  )
}

export { Segmented, SegmentedItem }
