import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getDeckForViewer } from '@revelio/db'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'
import { DeckOverview } from '@/components/deck-overview'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}): Promise<Metadata> {
  const { locale, id } = await params
  setRequestLocale(locale)
  const [session, t] = await Promise.all([getSession(), getTranslations('decks')])
  // getDeckForViewer returns null for a deck this viewer can't see, so a private
  // deck's name never leaks into the title for a non-owner.
  const existing = await getDeckForViewer(getDb(), id, session?.user?.id ?? null)
  return { title: existing ? existing.deck.name : t('title') }
}

export default async function DeckOverviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const session = await getSession()
  const viewerId = session?.user?.id ?? null
  const existing = await getDeckForViewer(getDb(), id, viewerId)
  if (!existing) notFound()

  return (
    <main className="mx-auto max-w-[2100px] px-6 py-6">
      <DeckOverview
        deckId={id}
        name={existing.deck.name}
        format={existing.deck.format}
        visibility={existing.deck.visibility}
        createdAt={existing.deck.createdAt}
        updatedAt={existing.deck.updatedAt}
        views={existing.views}
        isOwner={existing.userId === viewerId}
        loggedIn={!!session?.user}
        imageBase={IMAGE_BASE}
      />
    </main>
  )
}
