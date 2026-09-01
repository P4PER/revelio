'use client'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { CLEARED_FILTERS, emptyReason, parseSearchParams, withParams } from '@/lib/search-params'
import { EmptyResults } from '@/components/empty-results'
import { Button } from '@/components/ui/button'

// The search page's zero-result state. It reads the URL itself rather than
// taking props, matching ActiveFilters and ClearFilters, so the server page
// stays a server component.
//
// No filter chips here on purpose: the results bar directly above already
// renders the removable chips and the Clear-filters link. What that bar has no
// control for is dropping the *query*, so that is the escape this state adds.
export function SearchEmptyResults() {
  const t = useTranslations('search')
  const tf = useTranslations('filters')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const state = parseSearchParams(new URLSearchParams(params.toString()))
  const reason = emptyReason(state)
  const query = state.q.trim()

  const description =
    reason === 'queryAndFilters'
      ? t('empty.queryAndFilters', { query })
      : reason === 'filters'
        ? t('empty.filters')
        : reason === 'query'
          ? t('empty.query', { query })
          : t('empty.plain')

  function patch(next: Record<string, string | string[] | null>) {
    const merged = withParams(new URLSearchParams(params.toString()), next)
    router.push(`${pathname}?${merged.toString()}`)
  }

  const canClearFilters = reason === 'queryAndFilters' || reason === 'filters'

  return (
    <EmptyResults heading={t('empty.heading')} description={description}>
      {canClearFilters ? (
        <Button onClick={() => patch(CLEARED_FILTERS)}>{tf('clearFilters')}</Button>
      ) : null}
      {query ? (
        <Button variant="outline" onClick={() => patch({ q: null })}>
          {t('clear')}
        </Button>
      ) : null}
    </EmptyResults>
  )
}
