import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { Progress } from '@/components/ui/progress'
import { SetSymbol } from '@/components/set-symbol'
import type { SetDTO, SetProgress } from '@revelio/core'
import { cn } from '@/lib/utils'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

export function CollectionSidebar({
  sets, progress, selected, hrefFor,
}: {
  sets: SetDTO[]
  progress: SetProgress[]
  selected?: string
  hrefFor: (setCode: string) => string
}) {
  const t = useTranslations('collection')
  const byCode = new Map(progress.map((p) => [p.setCode, p]))
  return (
    <nav className="flex flex-col gap-1">
      {sets.map((s) => {
        const p = byCode.get(s.code) ?? { owned: 0, total: s.cardCount }
        const pct = p.total > 0 ? Math.round((p.owned / p.total) * 100) : 0
        const active = s.code === selected
        return (
          <Link key={s.code} href={hrefFor(s.code)}
            data-testid={`set-row-${s.code}`} data-active={active}
            className={cn('rounded-lg px-3 py-2 transition-colors hover:bg-accent/50', active && 'bg-accent')}>
            <div className="flex items-center gap-2">
              <span className="flex size-4 shrink-0 items-center justify-center text-primary">
                {s.symbol && IMAGE_BASE
                  ? <SetSymbol code={s.code} base={IMAGE_BASE} className="size-4" />
                  : null}
              </span>
              <span className="flex-1 truncate text-sm font-medium">{s.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {t('ofTotal', { owned: p.owned, total: p.total })}
              </span>
            </div>
            <Progress value={pct} className="mt-1.5 h-1" />
          </Link>
        )
      })}
    </nav>
  )
}
