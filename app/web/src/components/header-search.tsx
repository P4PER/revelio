'use client'
import { useState } from 'react'
import { Search } from 'lucide-react'
import { usePathname, useRouter } from '@/../i18n/navigation'
import { Input } from '@/components/ui/input'

export function HeaderSearch({ placeholder }: { placeholder: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [q, setQ] = useState('')

  // Home and the search page already have their own search box.
  if (pathname === '/' || pathname === '/search') return null

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        router.push(`/search?q=${encodeURIComponent(q)}`)
      }}
      className="relative mx-auto w-full max-w-md"
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-8 pl-8"
      />
    </form>
  )
}
