'use client'
import * as React from 'react'
import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { KbdHint } from '@/components/ui/kbd-hint'
import { SearchClearButton } from '@/components/search/search-clear-button'
import { cn } from '@/lib/utils'

// The app's standard search field (design "E"): a 32px outlined input with a
// leading search icon and a ⌘K hint that fades out on focus / once you type.
// Shared so every page-level search reads identically. `primary` marks it as the
// ⌘K target for the page (see SearchHotkey). Pass `onClear` to offer a reset
// button in the slot the kbd hint vacates once there is text - the caller owns
// it because only the caller knows what else has to change (a URL param, a
// filter model) when the query goes away. The ref is not forwarded: this
// component needs its own to reset uncontrolled callers.
export function SearchField({
  className,
  primary = false,
  placeholder,
  onClear,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'size' | 'ref'> & {
  primary?: boolean
  onClear?: () => void
}) {
  const t = useTranslations('search')
  const ref = React.useRef<HTMLInputElement>(null)

  // Reset the DOM value as well as telling the caller: these fields are used
  // both controlled and uncontrolled, and an uncontrolled one keeps its text
  // until something clears the node itself.
  function clear() {
    const el = ref.current
    if (el) {
      el.value = ''
      el.focus()
    }
    onClear?.()
  }

  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={ref}
        type="search"
        size="sm"
        data-search-primary={primary || undefined}
        placeholder={placeholder}
        className="peer w-full pr-11 pl-9 [&::-webkit-search-cancel-button]:hidden sm:pr-14"
        {...props}
      />
      <KbdHint className="absolute top-1/2 right-2 -translate-y-1/2" />
      {onClear && placeholder && (
        <SearchClearButton
          label={t('clear')}
          onClear={clear}
          className="absolute top-1/2 right-1 -translate-y-1/2"
        />
      )}
    </div>
  )
}
