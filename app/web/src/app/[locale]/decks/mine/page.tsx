import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Plus } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'
import { listDecksByUser } from '@revelio/db'
import { DeckList } from '@/components/deck-list'
import { DeckListSkeleton } from '@/components/deck-list-skeleton'
import { SignedOutTeaser } from '@/components/signed-out-teaser'
import { loginHref } from '@/lib/redirect-path'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('decks')
  // Personal ("my decks") and thin when logged out — keep out of the index.
  return { title: t('list.title'), robots: { index: false } }
}

export default async function DecksPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  setRequestLocale(locale)
  const session = await getSession()
  const t = await getTranslations('decks')

  if (!session?.user) {
    return (
      <main className="mx-auto max-w-[76rem] px-6 py-8">
        <SignedOutTeaser
          title={t('list.loggedOut.title')}
          description={t('list.loggedOut.desc')}
          primary={{ label: t('list.loggedOut.signIn'), href: loginHref('/decks/mine') }}
          secondary={{ label: t('list.loggedOut.tryBuilder'), href: '/decks/new' }}
        >
          <DeckListSkeleton />
        </SignedOutTeaser>
      </main>
    )
  }

  const decks = await listDecksByUser(getDb(), session.user.id)

  return (
    <main className="mx-auto max-w-[76rem] px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-primary">{t('list.title')}</h1>
        <Button asChild>
          <Link href="/decks/new" className="gap-1.5">
            <Plus className="size-4" />
            {t('list.newDeck')}
          </Link>
        </Button>
      </div>
      <DeckList decks={decks} />
    </main>
  )
}
