import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { searchCards } from '@revelio/search'
import {
  listSets, getCollectionSetProgress, getCollectionSummary, getOwnedQuantities,
  getOwnedCardIds, getDuplicateCardIds, getCollectionVisibility,
} from '@revelio/db'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { getSearchClient, runSearch } from '@/lib/search-client'
import { parseSearchParams, toSearchOptions } from '@/lib/search-params'
import { parseOwnership, applyOwnership } from '@/lib/collection-search'
import { toCollectionCards } from '@/lib/collection-cards'
import { CollectionView } from '@/components/collection-view'
import { CollectionSummary } from '@/components/collection-summary'
import { CollectionVisibilityToggle } from '@/components/collection-visibility-toggle'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://revelio.cards'

export default async function CollectionPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const session = await getSession()
  const userId = session?.user?.id
  if (!userId) redirect(`/${locale}/login`)

  const db = getDb()
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x))
    else if (v != null) sp.set(k, v)
  }
  const tab = sp.get('tab') === 'browse' ? 'browse' : 'sets'

  const [sets, progress, summary, visibility, ownedIds, dupeIds] = await Promise.all([
    listSets(db, locale),
    getCollectionSetProgress(db, userId),
    getCollectionSummary(db, userId),
    getCollectionVisibility(db, userId),
    getOwnedCardIds(db, userId),
    getDuplicateCardIds(db, userId),
  ])

  const selectedSet = sp.get('set') ?? sets[0]?.code ?? ''
  const client = getSearchClient()

  // By-set grid: the selected set's cards.
  const setRes = selectedSet
    ? await runSearch(client, locale, parseSearchParams(new URLSearchParams(`set=${selectedSet}`)))
    : { hits: [], total: 0, page: 1, hitsPerPage: 24 }

  // Browse grid: full search + ownership filter (Postgres ownership → Meili id filter).
  const state = parseSearchParams(sp)
  const ownership = parseOwnership(sp)
  const { query, options } = toSearchOptions(state)
  const browseRes = await searchCards(client, locale, query, applyOwnership(options, ownership, ownedIds, dupeIds))

  const quantities = await getOwnedQuantities(
    db, userId, [...setRes.hits, ...browseRes.hits].map((h) => h.id),
  )

  const t = await getTranslations({ locale, namespace: 'collection' })
  const path = session.user.username ? `/collection/${session.user.username}` : `/collection/u/${userId}`
  const shareUrl = `${BASE_URL}/${locale}${path}`

  return (
    <main className="mx-auto max-w-[76rem] px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary">{t('title')}</h1>
          <CollectionSummary summary={summary} />
        </div>
        <CollectionVisibilityToggle initial={visibility} shareUrl={shareUrl} />
      </div>
      <CollectionView
        sets={sets} progress={progress} selectedSet={selectedSet}
        cards={toCollectionCards(setRes.hits, IMAGE_BASE)}
        browseCards={toCollectionCards(browseRes.hits, IMAGE_BASE)}
        quantities={quantities} editable locale={locale} mode={tab}
      />
    </main>
  )
}
