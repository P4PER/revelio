import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { listSets } from '@revelio/db'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'
import { emptyDeck } from '@/lib/deck-model'
import { DeckBuilder } from '@/components/deck-builder'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('decks')
  return { title: t('title') }
}

export default async function NewDeckPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const [sets, session] = await Promise.all([listSets(getDb(), locale), getSession()])

  return (
    <main className="mx-auto max-w-[1850px] px-6 py-6">
      <DeckBuilder
        initial={emptyDeck()}
        deckId={null}
        loggedIn={!!session?.user}
        sets={sets}
        imageBase={IMAGE_BASE}
      />
    </main>
  )
}
