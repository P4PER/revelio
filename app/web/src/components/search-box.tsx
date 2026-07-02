'use client'
import { useSearchParams } from 'next/navigation'
import { useRef } from 'react'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { withParams } from '@/lib/search-params'
import { Input } from '@/components/ui/input'

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
    <Input
      type="search"
      defaultValue={params.get('q') ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
