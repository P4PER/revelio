import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { resolveCollectionOwner, getCollectionVisibility } from '@revelio/db'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { getSearchClient } from '@/lib/search-client'
import { loadCollectionPage } from '@/lib/collection-page-data'
import { CollectionView } from '@/components/collection-view'
import { CollectionSummary } from '@/components/collection-summary'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export default async function PublicCollectionPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string; username: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale, username } = await params
  setRequestLocale(locale)
  const db = getDb()
  const owner = await resolveCollectionOwner(db, decodeURIComponent(username))
  if (!owner) notFound()

  const session = await getSession()
  const isOwner = session?.user?.id === owner.userId
  const visibility = await getCollectionVisibility(db, owner.userId)
  if (visibility !== 'public' && !isOwner) notFound()

  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) {
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x))
    else if (v != null) sp.set(k, v)
  }

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
          quantities={data.quantities} editable={false} locale={locale} mode={data.tab}
        />
      </div>
    </main>
  )
}
