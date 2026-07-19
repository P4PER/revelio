import { notFound } from 'next/navigation'
import { setRequestLocale, getTranslations } from 'next-intl/server'
import { ChevronLeft } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { routing } from '@/../i18n/routing'
import { getDb } from '@/lib/db'
import { getSetForEdit } from '@revelio/db'
import { SetForm } from '@/components/set-form'
import { SetSymbolUploader } from '@/components/set-symbol-uploader'
import { DeleteSetButton } from '@/components/delete-set-button'

export const dynamic = 'force-dynamic'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export default async function EditSetPage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>
}) {
  const { locale, code } = await params
  setRequestLocale(locale)
  const set = await getSetForEdit(getDb(), code)
  if (!set) notFound()
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
      <h1 className="mb-6 text-2xl font-semibold text-primary">{set.name}</h1>
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
        <SetForm
          mode="edit"
          locales={[...routing.locales]}
          initial={{
            code: set.code,
            name: set.name,
            releaseDate: set.releaseDate ?? '',
            isOfficial: set.isOfficial,
            localizations: set.localizations,
          }}
        />
        <div className="space-y-6">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t('symbol')}</p>
            <SetSymbolUploader code={set.code} hasSymbol={set.symbolVersion != null} symbolVersion={set.symbolVersion} imageBase={IMAGE_BASE} />
          </div>
          <DeleteSetButton code={set.code} cardCount={set.cardCount} />
        </div>
      </div>
    </div>
  )
}
