'use client'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { CLEARED_FILTERS, hasActiveFilters, parseSearchParams, withParams } from '@/lib/search-params'
import { ClearFiltersButton } from '@/components/search/clear-filters-button'

// URL adapter for the search page: clears every narrowing filter (type/lesson/
// rarity/finish/legality/set/cost/official) in one click while preserving the
// search query and sort order.
export function ClearFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const active = hasActiveFilters(parseSearchParams(new URLSearchParams(params.toString())))

  function clear() {
    const next = withParams(new URLSearchParams(params.toString()), CLEARED_FILTERS)
    router.push(`${pathname}?${next.toString()}`)
  }

  return <ClearFiltersButton active={active} onClear={clear} />
}
