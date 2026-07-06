import { setRequestLocale, getTranslations } from 'next-intl/server'
import { routing } from '@/../i18n/routing'
import { getDb } from '@/lib/db'
import { listSubTypesWithTranslations } from '@revelio/db'
import { SubTypeTranslationsForm } from '@/components/subtype-translations-form'

export default async function AdminSubTypesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('admin')
  const rows = await listSubTypesWithTranslations(getDb())
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-primary">{t('subTypes')}</h1>
      <p className="mb-6 text-sm text-muted-foreground">{t('subTypesDesc')}</p>
      <SubTypeTranslationsForm locales={[...routing.locales]} rows={rows} />
    </div>
  )
}
