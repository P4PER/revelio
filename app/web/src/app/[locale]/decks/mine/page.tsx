import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { Plus } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { getDb } from '@/lib/db'
import { getSession } from '@/lib/session'
import { listDecksByUser } from '@revelio/db'
import { DeckList } from '@/components/deck-list'
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
  return { title: t('list.title') }
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
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold text-primary">{t('list.loggedOut.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('list.loggedOut.desc')}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button asChild>
            <Link href="/login">{t('list.loggedOut.signIn')}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/decks/new">{t('list.loggedOut.tryBuilder')}</Link>
          </Button>
        </div>
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
