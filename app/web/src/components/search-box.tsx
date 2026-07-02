'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { useRef } from 'react'
import { withParams } from '@/lib/search-params'

export function SearchBox({ placeholder }: { placeholder: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onChange(value: string) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const next = withParams(new URLSearchParams(params.toString()), { q: value })
      router.replace(`${pathname}?${next.toString()}`)
    }, 300)
  }

  return (
    <input
      type="search"
      role="searchbox"
      defaultValue={params.get('q') ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-input bg-background px-4 py-2 text-base outline-none focus:ring-2 focus:ring-ring"
    />
  )
}
