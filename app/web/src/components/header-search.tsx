'use client'
import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { usePathname, useRouter } from '@/../i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { withParams } from '@/lib/search-params'
import { KbdHint } from '@/components/ui/kbd-hint'

export function HeaderSearch({ placeholder }: { placeholder: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const params = useSearchParams()
  const onSearchPage = pathname === '/search'
  const urlQ = params.get('q') ?? ''
  const [q, setQ] = useState(onSearchPage ? urlQ : '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const internal = useRef(false)

  // Sync the field to the URL query whenever the route/query changes. Only the
  // search page's `q` belongs in this box; other pages (e.g. /decks browse) also
  // use `q` for their own search, so off the search page we clear the field
  // instead of mirroring an unrelated query. Skip the sync caused by our typing.
  useEffect(() => {
    if (internal.current) {
      internal.current = false
      return
    }
    setQ(onSearchPage ? urlQ : '')
  }, [urlQ, onSearchPage])

  // Home has its own hero search.
  if (pathname === '/') return null

  function submit(value: string) {
    if (onSearchPage) {
      const next = withParams(new URLSearchParams(params.toString()), { q: value })
      router.replace(`/search?${next.toString()}`)
    } else {
      router.push(`/search?q=${encodeURIComponent(value)}`)
    }
  }

  function onChange(value: string) {
    internal.current = true
    setQ(value)
    if (!onSearchPage) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => submit(value), 300)
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        submit(q)
      }}
      className="relative w-full min-w-0 max-w-md"
    >
      <Search className="pointer-events-none absolute top-1/2 left-0 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={q}
        onChange={(e) => onChange(e.target.value)}
        data-search-hotkey
        className="peer h-8 w-full rounded-none border-0 border-b border-input bg-transparent pr-14 pl-6 text-sm text-foreground outline-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
      />
      {/* Reveal-glow: a gold underline that wipes in on focus / while querying. */}
      <span className="pointer-events-none absolute inset-x-0 -bottom-px h-px origin-left scale-x-0 bg-gradient-to-r from-primary to-primary/20 transition-transform duration-300 peer-focus:scale-x-100 peer-[:not(:placeholder-shown)]:scale-x-100" />
      <KbdHint shortcut="slash" className="absolute top-1/2 right-0 -translate-y-1/2 transition-opacity peer-focus:opacity-0 peer-[:not(:placeholder-shown)]:opacity-0" />
    </form>
  )
}
