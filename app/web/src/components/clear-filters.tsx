'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { parseSearchParams, withParams } from '@/lib/search-params'
import { ClearFiltersButton } from './clear-filters-button'

// URL adapter for the search page: clears every narrowing filter (type/lesson/
// rarity/finish/legality/set/cost/official) in one click while preserving the
// search query and sort order.
const CLEARED: Record<string, null> = {
  type: null, lesson: null, rarity: null, finish: null,
  legality: null, set: null, costMin: null, costMax: null, official: null,
}

export function ClearFilters() {
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

  function clear() {
    const next = withParams(new URLSearchParams(params.toString()), CLEARED)
    router.push(`${pathname}?${next.toString()}`)
  }

  return <ClearFiltersButton active={hasFilters} onClear={clear} />
}
