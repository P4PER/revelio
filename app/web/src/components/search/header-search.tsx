'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from '@/../i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { withParams } from '@/lib/search-params'
import { HEADER_SEARCH_CLASS, HeaderSearchField } from '@/components/search/header-search-field'

export function HeaderSearch({
  placeholder,
  clearLabel,
}: {
  placeholder: string
  clearLabel: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const params = useSearchParams()
  const onSearchPage = pathname === '/search'
  const urlQ = params.get('q') ?? ''
  const [q, setQ] = useState(onSearchPage ? urlQ : '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const internal = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

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

  // Clearing goes through onChange so the search page reacts exactly as it does
  // to deleting the text by hand, then hands focus back for the next query.
  function clear() {
    onChange('')
    inputRef.current?.focus()
  }

  function onChange(value: string) {
    setQ(value)
    // Only arm the skip when a URL change of ours is coming. Off the search page
    // nothing navigates, so arming it here would leave the flag set and swallow
    // the next genuine sync - landing on /search?q=... with an empty box.
    if (!onSearchPage) return
    internal.current = true
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
      className={HEADER_SEARCH_CLASS}
    >
      <HeaderSearchField
        placeholder={placeholder}
        clearLabel={clearLabel}
        value={q}
        onChange={onChange}
        onClear={clear}
        inputRef={inputRef}
      />
    </form>
  )
}
