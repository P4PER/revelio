'use client'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { withParams, SORT_KEYS, type SortKey } from '@/lib/search-params'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function SortSelect() {
  const t = useTranslations('search.sort')
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
      <SelectTrigger aria-label={t('label')} size="sm" className="w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SORT_KEYS.map((key) => (
          <SelectItem key={key} value={key}>{t(key)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
