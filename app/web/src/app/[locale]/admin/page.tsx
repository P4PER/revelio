import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/../i18n/navigation'

export default async function AdminIndexPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('admin')
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-primary">{t('title')}</h1>
      <div className="space-y-3">
        <Link
          href="/admin/sub-types"
          className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
        >
          <div className="font-medium">{t('subTypes')}</div>
          <div className="text-sm text-muted-foreground">{t('subTypesDesc')}</div>
        </Link>
        <Link
          href="/admin/sets"
          className="block rounded-lg border p-4 transition-colors hover:bg-muted/50"
        >
          <div className="font-medium">{t('sets.title')}</div>
          <div className="text-sm text-muted-foreground">{t('sets.desc')}</div>
        </Link>
      </div>
    </div>
  )
}
