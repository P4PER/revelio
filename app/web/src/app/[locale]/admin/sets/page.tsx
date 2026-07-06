import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Plus } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { getDb } from '@/lib/db'
import { listSets } from '@revelio/db'
import { AdminSetsTable } from '@/components/admin-sets-table'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export default async function AdminSetsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  const t = await getTranslations('admin.sets')
  const sets = await listSets(getDb(), locale)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-primary">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('desc')}</p>
        </div>
        <Button asChild>
          <Link href="/admin/sets/new" className="gap-1.5">
            <Plus className="size-4" />
            {t('new')}
          </Link>
        </Button>
      </div>
      <AdminSetsTable sets={sets} imageBase={IMAGE_BASE} />
    </div>
  )
}
