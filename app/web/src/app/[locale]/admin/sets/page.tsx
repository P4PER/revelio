import { setRequestLocale, getTranslations } from 'next-intl/server'
import { Plus } from 'lucide-react'
import { Link } from '@/../i18n/navigation'
import { getDb } from '@/lib/db'
import { listSets } from '@revelio/db'
import { SetSymbol } from '@/components/set-symbol'
import { formatReleaseMonth } from '@/lib/set-sort'
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
      <ul className="divide-y rounded-lg border">
        {sets.map((s) => (
          <li key={s.code}>
            <Link href={`/admin/sets/${s.code}/edit`} className="flex items-center gap-4 p-3 transition-colors hover:bg-muted/50">
              <span className="flex h-8 w-8 items-center justify-center">
                {s.symbol && IMAGE_BASE ? (
                  <SetSymbol code={s.code} base={IMAGE_BASE} className="h-6 w-6 text-foreground/80" />
                ) : (
                  <span className="text-xs text-muted-foreground">{s.code}</span>
                )}
              </span>
              <span className="flex-1 font-medium">{s.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{s.code}</span>
              <span className="w-24 text-right text-sm text-muted-foreground">{formatReleaseMonth(s.releaseDate)}</span>
              <span className="w-14 text-right text-sm text-muted-foreground">{s.cardCount}</span>
              <span className="w-16 text-right text-xs text-muted-foreground">{s.isOfficial ? t('official') : 'Fan'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
