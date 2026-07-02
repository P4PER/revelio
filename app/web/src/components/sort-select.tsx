'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { withParams, type SortKey } from '@/lib/search-params'

const OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'name', label: 'Name' },
  { key: 'number', label: 'Number' },
  { key: 'cost', label: 'Cost' },
]

export function SortSelect() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  function onChange(value: string) {
    const patch = { sort: value === 'relevance' ? null : value }
    router.replace(
      `${pathname}?${withParams(new URLSearchParams(params.toString()), patch).toString()}`,
    )
  }

  return (
    <select
      aria-label="Sort by"
      defaultValue={params.get('sort') ?? 'relevance'}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-input bg-background px-3 py-2 text-sm"
    >
      {OPTIONS.map((o) => (
        <option key={o.key} value={o.key}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
