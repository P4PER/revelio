import type { Metadata } from 'next'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import type { SetDTO } from '@revelio/core'
import { getDb } from '@/lib/db'
import { listSets } from '@revelio/db'
import { SetCard } from '@/components/set-card'
import { byReleaseDate } from '@/lib/set-sort'

export const dynamic = 'force-dynamic'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('sets')
  return { title: t('title') }
}

function SetSection({ title, sets }: { title: string; sets: SetDTO[] }) {
  if (sets.length === 0) return null
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold text-foreground/90">{title}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {sets.map((set) => (
          <li key={set.code}>
            <SetCard set={set} imageBase={IMAGE_BASE} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export default async function SetsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('sets')
  const sets = await listSets(getDb(), locale)
  const official = sets.filter((s) => s.isOfficial).sort(byReleaseDate)
  const fan = sets.filter((s) => !s.isOfficial).sort(byReleaseDate)

  return (
    <main className="mx-auto max-w-[76rem] px-6 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-primary">{t('title')}</h1>
      <SetSection title={t('original')} sets={official} />
      <SetSection title={t('fanMade')} sets={fan} />
    </main>
  )
}
