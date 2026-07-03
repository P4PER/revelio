'use client'
import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { usePathname, useRouter } from '@/../i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { withParams } from '@/lib/search-params'
import { Input } from '@/components/ui/input'

export function HeaderSearch({ placeholder }: { placeholder: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const params = useSearchParams()
  const onSearchPage = pathname === '/search'
  const urlQ = params.get('q') ?? ''
  const [q, setQ] = useState(onSearchPage ? urlQ : '')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const internal = useRef(false)

  // Keep the field in sync with the URL query on the search page (e.g. when
  // arriving via a soft navigation). Skip syncs caused by our own typing.
  useEffect(() => {
    if (!onSearchPage) return
    if (internal.current) {
      internal.current = false
      return
    }
    setQ(urlQ)
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
      className="relative mx-auto w-full max-w-md"
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={q}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 pl-8"
      />
    </form>
  )
}
