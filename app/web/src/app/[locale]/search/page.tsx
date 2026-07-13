import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getSearchClient, runSearch } from '@/lib/search-client'
import { parseSearchParams, toURLSearchParams } from '@/lib/search-params'
import { CardGrid } from '@/components/card-grid'
import { Pagination } from '@/components/pagination'
import { SearchControls } from '@/components/search-controls'
import { getDb } from '@/lib/db'
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
  const sets = await listSets(getDb(), locale)
  const t = await getTranslations('search')

  return (
    <main className="mx-auto max-w-[76rem] px-6 py-8">
      <SearchControls locale={locale} sets={sets} />
      <p className="mb-4 text-sm text-muted-foreground" role="status">
        {t('results', { count: results.total })}
      </p>
      <CardGrid hits={results.hits} imageBase={IMAGE_BASE} />
      <Pagination
        page={results.page}
        total={results.total}
        hitsPerPage={results.hitsPerPage}
        current={current}
      />
    </main>
  )
}
