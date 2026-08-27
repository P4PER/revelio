import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getDb } from '@/lib/server/db'
import { getSession } from '@/lib/server/session'
import { listPublicDecks } from '@revelio/db'
import { browseToQuery, parseBrowseParams } from '@/lib/browse-params'
import { overflowPage } from '@/lib/page-range'
import { redirect } from '@/../i18n/navigation'
import { DeckBrowse } from '@/components/deck/deck-browse'
import { DECK_VIEW_COOKIE } from '@/lib/deck-view'

export const dynamic = 'force-dynamic'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('decks')
  return { title: t('explore.title') }
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

  // As on the card lists: a page past the end lands on the last real one.
  const overflow = overflowPage(state.page, result.pageSize, result.total)
  if (overflow) {
    const q = new URLSearchParams(browseToQuery({ ...state, page: overflow })).toString()
    redirect({ href: `/decks${q ? `?${q}` : ''}`, locale })
  }

  const savedView = cookieStore.get(DECK_VIEW_COOKIE)?.value
  const initialView = savedView === 'gallery' || savedView === 'list' ? savedView : undefined

  return (
    <main className="mx-auto max-w-[76rem] px-6 py-8">
      <DeckBrowse
        state={state}
        entries={result.entries}
        total={result.total}
        pageSize={result.pageSize}
        initialView={initialView}
        imageBase={IMAGE_BASE}
      />
    </main>
  )
}
