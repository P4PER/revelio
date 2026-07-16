import { redirect } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getCollectionVisibility } from '@revelio/db'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { getSearchClient } from '@/lib/search-client'
import { loadCollectionPage } from '@/lib/collection-page-data'
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

  const [data, visibility] = await Promise.all([
    loadCollectionPage(db, getSearchClient(), locale, userId, sp, IMAGE_BASE),
    getCollectionVisibility(db, userId),
  ])

  const t = await getTranslations({ locale, namespace: 'collection' })
  const path = session.user.username ? `/collection/${session.user.username}` : `/collection/u/${userId}`
  // No locale prefix: with localePrefix 'as-needed' the prefix-less URL is the
  // canonical (default-locale) link.
  const shareUrl = `${BASE_URL}${path}`

  return (
    <main className="mx-auto max-w-[76rem] px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary">{t('title')}</h1>
          <CollectionSummary summary={data.summary} />
        </div>
        <CollectionVisibilityToggle initial={visibility} shareUrl={shareUrl} />
      </div>
      <CollectionView
        sets={data.sets} progress={data.progress} selectedSet={data.selectedSet}
        cards={data.setCards} browseCards={data.browseCards}
        browseTotal={data.browseTotal} browsePage={data.browsePage} browsePageSize={data.browsePageSize}
        quantities={data.quantities} editable locale={locale} mode={data.tab}
      />
    </main>
  )
}
