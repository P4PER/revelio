import { setRequestLocale } from 'next-intl/server'
import { redirect } from '@/../i18n/navigation'
import { getDb } from '@/lib/db'
import { getRandomCardId } from '@revelio/db'

export const dynamic = 'force-dynamic'

export default async function RandomPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const id = await getRandomCardId(getDb())
  redirect({ href: id ? `/card/${id}` : '/search', locale })
}
