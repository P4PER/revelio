'use client'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { parseSearchParams, withParams } from '@/lib/search-params'
import { Button } from '@/components/ui/button'

// Clears every narrowing filter (type/lesson/rarity/finish/legality/set/cost/
// official) in one click while preserving the search query and sort order.
// Rendered only when at least one filter is active.
const CLEARED: Record<string, null> = {
  type: null, lesson: null, rarity: null, finish: null,
  legality: null, set: null, costMin: null, costMax: null, official: null,
}

export function ClearFilters() {
  const t = useTranslations('filters')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const s = parseSearchParams(new URLSearchParams(params.toString()))

  const hasFilters =
    s.types.length > 0 ||
    s.lessons.length > 0 ||
    s.rarities.length > 0 ||
    s.finishes.length > 0 ||
    s.legalities.length > 0 ||
    Boolean(s.set) ||
    s.costMin != null ||
    s.costMax != null ||
    s.official !== null
  if (!hasFilters) return null

  function clear() {
    const next = withParams(new URLSearchParams(params.toString()), CLEARED)
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <Button variant="ghost" size="sm" onClick={clear}>{t('clearFilters')}</Button>
  )
}
