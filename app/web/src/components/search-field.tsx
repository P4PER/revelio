'use client'
import * as React from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { KbdHint } from '@/components/ui/kbd-hint'
import { cn } from '@/lib/utils'

// The app's standard search field (design "E"): a 32px outlined input with a
// leading search icon and a ⌘K hint that fades out on focus / once you type.
// Shared so every page-level search reads identically. `primary` marks it as the
// ⌘K target for the page (see SearchHotkey).
export function SearchField({
  className,
  primary = false,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'size'> & { primary?: boolean }) {
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        size="sm"
        data-search-primary={primary || undefined}
        className="peer w-full pr-3 pl-9 [&::-webkit-search-cancel-button]:hidden sm:pr-14"
        {...props}
      />
      <KbdHint className="absolute top-1/2 right-2 -translate-y-1/2" />
    </div>
  )
}
