import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { getDeck, listSets } from '@revelio/db'
import type { BuilderState } from '@/lib/deck-model'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'
import { DeckBuilder } from '@/components/deck-builder'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}): Promise<Metadata> {
  const { locale, id } = await params
  setRequestLocale(locale)
  const [session, existing, t] = await Promise.all([
    getSession(),
    getDeck(getDb(), id),
    getTranslations('decks'),
  ])
  const isOwner = !!existing && existing.userId === session?.user?.id
  return { title: isOwner ? existing.deck.name : t('title') }
}

export default async function EditDeckPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>
}) {
  const { locale, id } = await params
  setRequestLocale(locale)
  const [session, existing, sets] = await Promise.all([
    getSession(),
    getDeck(getDb(), id),
    listSets(getDb(), locale),
  ])

  // Owner-only: a missing deck and a deck owned by someone else both 404, so
  // the response can't be used to probe for another user's deck IDs.
  if (!existing || existing.userId !== session?.user?.id) notFound()

  const state: BuilderState = {
    name: existing.deck.name,
    format: existing.deck.format,
    visibility: existing.deck.visibility,
    entries: existing.views,
  }

  return (
    <main className="mx-auto max-w-[1850px] px-6 py-6">
      <DeckBuilder initial={state} deckId={id} loggedIn sets={sets} imageBase={IMAGE_BASE} />
    </main>
  )
}
