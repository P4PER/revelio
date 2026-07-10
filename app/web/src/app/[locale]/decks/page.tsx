import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'
import { listPublicDecks } from '@revelio/db'
import { parseBrowseParams } from '@/lib/browse-params'
import { DeckBrowse } from '@/components/deck-browse'
import { DECK_VIEW_COOKIE } from '@/lib/deck-view'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('decks')
  return { title: t('browse.title') }
}

export default async function DecksBrowsePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const sp = await searchParams
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => usp.append(k, x))
    else if (v != null) usp.set(k, v)
  }
  const state = parseBrowseParams(usp)

  const [session, cookieStore] = await Promise.all([getSession(), cookies()])
  const viewerId = session?.user?.id ?? null
  const result = await listPublicDecks(getDb(), {
    search: state.q, lessons: state.lessons, format: state.format,
    sort: state.sort, page: state.page, viewerId,
  })

  const savedView = cookieStore.get(DECK_VIEW_COOKIE)?.value
  const initialView = savedView === 'gallery' || savedView === 'list' ? savedView : undefined

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <DeckBrowse
        state={state}
        entries={result.entries}
        total={result.total}
        pageCount={result.pageCount}
        loggedIn={!!session?.user}
        initialView={initialView}
      />
    </main>
  )
}
