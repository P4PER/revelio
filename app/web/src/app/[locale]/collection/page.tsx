import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getCollectionVisibility } from '@revelio/db'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { getSearchClient } from '@/lib/search-client'
import { loadCollectionPage } from '@/lib/collection-page-data'
import { toURLSearchParams } from '@/lib/search-params'
import { STEPPER_LAYOUT_COOKIE, parseStepperLayout } from '@/lib/collection-prefs'
import { CollectionView } from '@/components/collection-view'
import { CollectionSummary } from '@/components/collection-summary'
import { CollectionVisibilityToggle } from '@/components/collection-visibility-toggle'
import { CollectionSkeleton } from '@/components/collection-skeleton'
import { SignedOutTeaser } from '@/components/signed-out-teaser'
import { loginHref } from '@/lib/redirect-path'
import { SITE_URL as BASE_URL } from '@/lib/site'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations({ locale, namespace: 'collection' })
  // A personal page, and renderable signed out since the teaser landed - keep
  // it out of search indexes either way.
  return { title: t('title'), robots: { index: false } }
}

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
  const sp = toURLSearchParams(await searchParams)
  if (!userId) {
    // Signed out, this page still has a story to tell, so it shows a teaser over
    // a ghost of the real layout rather than bouncing to the login form.
    const [t, tOut] = await Promise.all([
      getTranslations({ locale, namespace: 'collection' }),
      getTranslations({ locale, namespace: 'collection.loggedOut' }),
    ])
    // Carry the current view (tab, selected set, filters) into the redirect, so
    // someone who followed a deep link is returned to it rather than to a bare
    // /collection.
    const qs = sp.toString()
    const here = qs ? `/collection?${qs}` : '/collection'
    return (
      <main className="mx-auto max-w-[76rem] px-6 py-8">
        {/* Same heading, same position as the signed-in page: a visitor should
            never have to guess which page they landed on. */}
        <h1 className="mb-6 text-2xl font-semibold text-primary-ink">{t('title')}</h1>
        <SignedOutTeaser
          title={tOut('title')}
          description={tOut('desc')}
          primary={{ label: tOut('signIn'), href: loginHref(here) }}
          secondary={{ label: tOut('browseSets'), href: '/sets' }}
        >
          <CollectionSkeleton />
        </SignedOutTeaser>
      </main>
    )
  }

  const db = getDb()

  const [data, visibility, cookieStore] = await Promise.all([
    loadCollectionPage(db, getSearchClient(), locale, userId, sp, IMAGE_BASE),
    getCollectionVisibility(db, userId),
    cookies(),
  ])
  const stepperLayout = parseStepperLayout(cookieStore.get(STEPPER_LAYOUT_COOKIE)?.value)

  const t = await getTranslations({ locale, namespace: 'collection' })
  const path = session.user.username ? `/collection/${session.user.username}` : `/collection/u/${userId}`
  // No locale prefix: with localePrefix 'as-needed' the prefix-less URL is the
  // canonical (default-locale) link.
  const shareUrl = `${BASE_URL}${path}`

  return (
    <main className="mx-auto max-w-[76rem] px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary-ink">{t('title')}</h1>
          <CollectionSummary summary={data.summary} />
        </div>
        <CollectionVisibilityToggle initial={visibility} shareUrl={shareUrl} />
      </div>
      <CollectionView
        sets={data.sets} progress={data.progress} selectedSet={data.selectedSet}
        cards={data.setCards} browseCards={data.browseCards}
        browseTotal={data.browseTotal} browsePage={data.browsePage} browsePageSize={data.browsePageSize}
        quantities={data.quantities} editable locale={locale} mode={data.tab}
        stepperLayout={stepperLayout}
      />
    </main>
  )
}
