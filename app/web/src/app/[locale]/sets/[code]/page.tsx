import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { getDb } from '@/lib/db'
import { getSetByCode } from '@revelio/db'
import { formatReleaseMonth } from '@/lib/set-sort'
import { getSearchClient, runSearch } from '@/lib/search-client'
import { parseSearchParams, toURLSearchParams } from '@/lib/search-params'
import { CardGrid } from '@/components/card-grid'
import { Pagination } from '@/components/pagination'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; code: string }>
}): Promise<Metadata> {
  const { locale, code } = await params
  setRequestLocale(locale)
  const set = await getSetByCode(getDb(), code)
  return set ? { title: `${set.name} (${set.code})` } : {}
}

export default async function SetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; code: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale, code } = await params
  setRequestLocale(locale)
  const set = await getSetByCode(getDb(), code)
  if (!set) notFound()
  const t = await getTranslations('sets')

  const current = toURLSearchParams(await searchParams)
  const state = {
    q: '',
    types: [],
    lessons: [],
    set: code,
    official: null,
    sort: 'number' as const,
    page: parseSearchParams(current).page,
    rarities: [],
    finishes: [],
    legalities: [],
    costMin: null,
    costMax: null,
  }
  const results = await runSearch(getSearchClient(), locale, state)

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-primary">{set.name}</h1>
        <p className="text-sm text-muted-foreground">
          {t('meta', { count: set.cardCount, date: formatReleaseMonth(set.releaseDate) })}
        </p>
      </header>
      <CardGrid hits={results.hits} imageBase={IMAGE_BASE} />
      <Pagination
        page={results.page}
        total={results.total}
        hitsPerPage={results.hitsPerPage}
        current={current}
        basePath={`/sets/${code}`}
      />
    </main>
  )
}
