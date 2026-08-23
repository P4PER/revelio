import { useTranslations } from 'next-intl'
import { Progress } from '@/components/ui/progress'
import { SidebarNavLink } from '@/components/sidebar-nav-link'
import { SetSymbol } from '@/components/set/set-symbol'
import type { SetDTO, SetProgress } from '@revelio/core'
import { cn } from '@/lib/utils'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''

/** Shared shape for the set-nav sidebar and its responsive wrapper. */
export type SetNavProps = {
  sets: SetDTO[]
  progress: SetProgress[]
  selected?: string
  hrefFor: (setCode: string) => string
}

export function CollectionSidebar({
  sets, progress, selected, hrefFor, onSelect,
}: SetNavProps & { onSelect?: () => void }) {
  const t = useTranslations('collection')
  const byCode = new Map(progress.map((p) => [p.setCode, p]))
  return (
    <nav className="flex flex-col gap-1">
      {sets.map((s) => {
        const p = byCode.get(s.code) ?? { owned: 0, total: s.cardCount }
        const pct = p.total > 0 ? Math.round((p.owned / p.total) * 100) : 0
        const active = s.code === selected
        return (
          <SidebarNavLink key={s.code} href={hrefFor(s.code)} active={active}
            onSelect={onSelect} testId={`set-row-${s.code}`}>
            <div className="flex items-center gap-2">
              <span className="flex h-4 w-8 shrink-0 items-center justify-center text-primary-ink">
                {s.symbolVersion != null && IMAGE_BASE
                  ? <SetSymbol code={s.code} version={s.symbolVersion} base={IMAGE_BASE} className="size-4" />
                  : <span className="text-[9px] font-semibold uppercase leading-none">{s.code}</span>}
              </span>
              <span className={cn('flex-1 truncate text-sm', active ? 'font-semibold text-foreground' : 'font-medium')}>{s.name}</span>
              <span className={cn('text-xs tabular-nums', active ? 'text-foreground' : 'text-muted-foreground')}>
                {t('ofTotal', { owned: p.owned, total: p.total })}
              </span>
            </div>
            <Progress value={pct} className="mt-1.5 h-1" />
          </SidebarNavLink>
        )
      })}
    </nav>
  )
}
