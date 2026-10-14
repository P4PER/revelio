import * as React from 'react'
import { cn } from '@/lib/utils'

// Density tiers mirror the Input scale (text, padding and a floor; height
// auto-grows). See docs/superpowers/specs/2026-07-28-control-size-standard-design.md.
// The bottom padding carries one extra line (1lh), so there's always a blank
// line below the text - also once a capped box has scrolled to its end, since
// every engine scrolls textarea padding. Each min-height is about two lines of
// text plus that blank line at the tier's line height.
const sizeClasses = {
  sm: 'min-h-18 px-2.5 pt-1.5 pb-[calc(--spacing(1.5)+1lh)] text-sm',
  default: 'min-h-19 px-3 pt-2 pb-[calc(--spacing(2)+1lh)] text-sm',
  lg: 'min-h-22 px-3 pt-2 pb-[calc(--spacing(2)+1lh)] text-base',
} as const

// A textarea that grows to fit its content. The browser does the sizing
// (field-sizing: content, as shadcn's Textarea does), so nothing measures or
// resets the height per keystroke - that reset briefly collapsed the box to its
// min-height and made a scrolling parent (the deck import Sheet) jump. A caller
// may cap the growth with a max-h-* class; past it the box scrolls. Browsers
// without field-sizing (before Firefox 152, Safari 26.2) keep the min-height
// and scroll, which stays usable.
export function AutoTextarea({
  className,
  size = 'default',
  ...props
}: Omit<React.ComponentProps<'textarea'>, 'size'> & { size?: keyof typeof sizeClasses }) {
  return (
    <textarea
      className={cn(
        'field-sizing-content block w-full resize-none overflow-y-auto rounded-md border border-input bg-input-fill shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        sizeClasses[size],
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  )
}
