import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { getDb } from '@/lib/server/db'
import { getSetByCode } from '@revelio/db'
import { formatReleaseMonth } from '@/lib/set-sort'
import { getSearchClient, runSearch } from '@/lib/server/search-client'
import { FULL_SET_LIMIT } from '@/lib/search-params'
import { CardGrid } from '@/components/card/card-grid'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; code: string }>
}): Promise<Metadata> {
  const { locale, code } = await params
  setRequestLocale(locale)
  const set = await getSetByCode(getDb(), code, locale)
  return set ? { title: `${set.name} (${set.code})` } : {}
}

export default async function SetPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>
}) {
  const { locale, code } = await params
  setRequestLocale(locale)
  const set = await getSetByCode(getDb(), code, locale)
  if (!set) notFound()
  const t = await getTranslations('sets')

  // A set is a bounded, ordered list - 140 cards at the largest - that people
  // read as a whole, the way the collection's By-set view already renders one.
  // So the page shows every card at once and has nothing to paginate; the tiles
  // below the fold cost nothing until scrolled to, since next/image lazy-loads.
  const state = {
    q: '',
    types: [],
    lessons: [],
    set: code,
    official: null,
    sort: 'number' as const,
    page: 1,
    rarities: [],
    finishes: [],
    legalities: [],
    costMin: null,
    costMax: null,
  }
  const results = await runSearch(getSearchClient(), locale, state, { hitsPerPage: FULL_SET_LIMIT })

  return (
    <main className="mx-auto max-w-[76rem] px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-heading">{set.name}</h1>
        <p className="text-sm text-muted-foreground">
          {t('meta', { count: set.cardCount, date: formatReleaseMonth(set.releaseDate) })}
        </p>
      </header>
      <CardGrid hits={results.hits} imageBase={IMAGE_BASE} />
    </main>
  )
}
