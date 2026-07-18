import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { resolveCollectionOwner, getCollectionVisibility } from '@revelio/db'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { getSearchClient } from '@/lib/search-client'
import { loadCollectionPage } from '@/lib/collection-page-data'
import { toURLSearchParams } from '@/lib/search-params'
import { CollectionView } from '@/components/collection-view'
import { CollectionSummary } from '@/components/collection-summary'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

// Shared read-only public collection view behind both /collection/[username]
// and the /collection/u/[userId] fallback: resolve the owner by the given
// identifier, enforce the visibility guard, then render the owner's dashboard.
export async function PublicCollection({
  locale, identifier, searchParams,
}: {
  locale: string
  identifier: string
  searchParams: Record<string, string | string[] | undefined>
}) {
  setRequestLocale(locale)
  const db = getDb()
  const owner = await resolveCollectionOwner(db, decodeURIComponent(identifier))
  if (!owner) notFound()

  const session = await getSession()
  const isOwner = session?.user?.id === owner.userId
  const visibility = await getCollectionVisibility(db, owner.userId)
  if (visibility !== 'public' && !isOwner) notFound()

  const sp = toURLSearchParams(searchParams)
  const data = await loadCollectionPage(db, getSearchClient(), locale, owner.userId, sp, IMAGE_BASE)
  const t = await getTranslations({ locale, namespace: 'collection' })

  return (
    <main className="mx-auto max-w-[76rem] px-6 py-8">
      <h1 className="text-2xl font-semibold text-primary">{owner.username ?? t('title')}</h1>
      <div className="mt-1"><CollectionSummary summary={data.summary} /></div>
      <div className="mt-6">
        <CollectionView
          sets={data.sets} progress={data.progress} selectedSet={data.selectedSet}
          cards={data.setCards} browseCards={data.browseCards}
          browseTotal={data.browseTotal} browsePage={data.browsePage} browsePageSize={data.browsePageSize}
          quantities={data.quantities} editable={false} locale={locale} mode={data.tab}
        />
      </div>
    </main>
  )
}
