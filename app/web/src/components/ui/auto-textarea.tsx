'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'

// Density tiers mirror the Input scale (text/padding only; height auto-grows).
// See docs/superpowers/specs/2026-07-28-control-size-standard-design.md.
const sizeClasses = {
  sm: 'px-2.5 py-1.5 text-sm',
  default: 'px-3 py-2 text-sm',
  lg: 'px-3 py-2 text-base',
} as const

// A textarea that grows to fit its content plus one extra line, so there's
// always a blank line below the text. A caller may cap the growth with a
// max-h-* class; past that cap the box scrolls rather than clipping the rest.
export function AutoTextarea({
  className,
  value,
  onChange,
  ref: forwardedRef,
  size = 'default',
  ...props
}: Omit<React.ComponentProps<'textarea'>, 'size'> & { size?: keyof typeof sizeClasses }) {
  const innerRef = React.useRef<HTMLTextAreaElement>(null)

  // Compose the internal auto-grow ref with any forwarded ref. Without this,
  // rendering inside a Radix Slot (shadcn's <FormControl>) forwards a ref that
  // would otherwise clobber innerRef, leaving it null so resize() never runs.
  // Re-derived when forwardedRef changes so React re-attaches to the new ref
  // (correct ref semantics: old ref cleared, new ref set).
  const setRef = React.useCallback(
    (el: HTMLTextAreaElement | null) => {
      innerRef.current = el
      if (typeof forwardedRef === 'function') forwardedRef(el)
      else if (forwardedRef) forwardedRef.current = el
    },
    [forwardedRef],
  )

  const resize = React.useCallback(() => {
    const el = innerRef.current
    if (!el) return
    // Measure with overflow hidden: a classic (space-taking) scrollbar left on
    // by the last resize narrows the content box, wraps more and over-reports
    // scrollHeight.
    el.style.overflowY = 'hidden'
    el.style.height = 'auto'
    const style = getComputedStyle(el)
    const line = parseFloat(style.lineHeight) || 20
    const height = el.scrollHeight + line
    el.style.height = `${height}px`
    // overflow stays hidden while the box can still grow, so no scrollbar
    // flashes up mid-resize; maxHeight parses to NaN for "none".
    el.style.overflowY = height > parseFloat(style.maxHeight) ? 'auto' : 'hidden'
  }, [])

  React.useEffect(() => {
    resize()
  }, [value, resize])

  return (
    <textarea
      ref={setRef}
      rows={2}
      value={value}
      onChange={(e) => {
        onChange?.(e)
        resize()
      }}
      className={cn(
        'w-full resize-none overflow-hidden rounded-md border border-input bg-input-fill shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        sizeClasses[size],
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  )
}
