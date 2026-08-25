import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSearchClient, runSearch } from '@/lib/server/search-client'
import { pageQuery, parseSearchParams, toURLSearchParams } from '@/lib/search-params'
import { overflowPage } from '@/lib/page-range'
import { redirect } from '@/../i18n/navigation'
import { CardGrid } from '@/components/card/card-grid'
import { Pagination } from '@/components/search/pagination'
import { ResultCount } from '@/components/search/result-count'
import { SearchControls } from '@/components/search/search-controls'
import { SortSelect } from '@/components/search/sort-select'
import { getDb } from '@/lib/server/db'
import { listSets } from '@revelio/db'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const state = parseSearchParams(toURLSearchParams(await searchParams))
  const t = await getTranslations('search')
  return { title: state.q.trim() || t('title') }
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const current = toURLSearchParams(await searchParams)
  const state = parseSearchParams(current)
  const results = await runSearch(getSearchClient(), locale, state)
  // A page past the end would otherwise render an empty grid under a range of
  // records nobody can see; land the reader on the last page that has cards.
  const overflow = overflowPage(state.page, results.hitsPerPage, results.total)
  if (overflow) redirect({ href: `/search?${pageQuery(current, overflow)}`, locale })
  const sets = await listSets(getDb(), locale)

  return (
    <main className="mx-auto max-w-[76rem] px-6 py-8">
      <SearchControls locale={locale} sets={sets} />
      {/* Results header: count on the left, Sort right-aligned above the grid
          (Sort orders results, so it lives here — not in the filter toolbar). */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <ResultCount page={results.page} pageSize={results.hitsPerPage} total={results.total} />
        <SortSelect />
      </div>
      <CardGrid
        hits={results.hits}
        imageBase={IMAGE_BASE}
        searchParams={current}
        startIndex={(results.page - 1) * results.hitsPerPage}
      />
      <Pagination
        page={results.page}
        total={results.total}
        hitsPerPage={results.hitsPerPage}
        current={current}
        announcedByHeader
      />
    </main>
  )
}
