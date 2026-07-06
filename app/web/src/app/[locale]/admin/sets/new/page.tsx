import { setRequestLocale, getTranslations } from 'next-intl/server'
import { ChevronLeft } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { routing } from '@/../i18n/routing'
import { SetForm } from '@/components/set-form'

export const dynamic = 'force-dynamic'

export default async function NewSetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('admin.sets')
  return (
    <div>
      <Link
        href="/admin/sets"
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        {t('back')}
      </Link>
      <h1 className="mb-6 text-2xl font-semibold text-primary">{t('new')}</h1>
      <SetForm
        mode="create"
        locales={[...routing.locales]}
        initial={{ code: '', name: '', releaseDate: '', isOfficial: false, localizations: {} }}
      />
    </div>
  )
}
