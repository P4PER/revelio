import { setRequestLocale, getTranslations } from 'next-intl/server'
import { getDb } from '@/lib/db'
import { listSets } from '@revelio/db'
import { SetCard } from '@/components/set-card'

export const dynamic = 'force-dynamic'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export default async function SetsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('sets')
  const sets = await listSets(getDb())
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-primary">{t('title')}</h1>
      <ul className="grid gap-3 sm:grid-cols-2">
        {sets.map((set) => (
          <li key={set.code}>
            <SetCard set={set} imageBase={IMAGE_BASE} />
          </li>
        ))}
      </ul>
    </main>
  )
}
