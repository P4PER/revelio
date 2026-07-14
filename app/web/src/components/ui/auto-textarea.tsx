'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'

// A textarea that grows to fit its content plus one extra line, so there's
// always a blank line below the text.
export function AutoTextarea({ className, value, onChange, ...props }: React.ComponentProps<'textarea'>) {
  const ref = React.useRef<HTMLTextAreaElement>(null)

  const resize = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const line = parseFloat(getComputedStyle(el).lineHeight) || 20
    el.style.height = `${el.scrollHeight + line}px`
  }, [])

  React.useEffect(() => {
    resize()
  }, [value, resize])

  return (
    <textarea
      ref={ref}
      rows={2}
      value={value}
      onChange={(e) => {
        onChange?.(e)
        resize()
      }}
      className={cn(
        'w-full resize-none overflow-hidden rounded-md border border-input bg-input-fill px-3 py-2 text-sm',
        className,
      )}
      {...props}
    />
  )
}
