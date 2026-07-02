'use client'
import { useRouter } from '@/../i18n/navigation'
import { useState } from 'react'

export function HomeSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  return (
    <form
      role="search"
      onSubmit={(e) => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(q)}`) }}
      className="mx-auto mt-8 flex max-w-xl gap-2"
    >
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="flex-1 rounded-md border border-input bg-background px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring"
      />
      <button type="submit" className="rounded-md bg-primary px-5 py-3 font-semibold text-primary-foreground">
        Search
      </button>
    </form>
  )
}
