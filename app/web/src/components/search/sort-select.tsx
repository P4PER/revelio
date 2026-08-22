'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { withParams, type SortKey } from '@/lib/search-params'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

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
  const current = (params.get('sort') as SortKey | null) ?? 'relevance'

  function onValueChange(value: string) {
    const patch = { sort: value === 'relevance' ? null : value }
    router.replace(`${pathname}?${withParams(new URLSearchParams(params.toString()), patch).toString()}`)
  }

  return (
    <Select value={current} onValueChange={onValueChange}>
      <SelectTrigger aria-label="Sort by" size="sm" className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
