'use client'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The single pagination look for the whole app: a "Showing X–Y of Z" record
 * range on the left and Previous / Next buttons on the right. Buttons disable
 * (rather than disappear) at the first/last page so the controls stay put.
 * Renders nothing when everything fits on a single page.
 *
 * Two modes, so it works from both server pages and client tables:
 * - link mode: pass `prevHref`/`nextHref` (server-safe — strings, no closures)
 * - button mode: pass `onPrev`/`onNext` (client callers: tanstack tables, browse)
 */
export function PaginationNav({
  page, pageSize, total, className, prevHref, nextHref, onPrev, onNext,
}: {
  page: number
  pageSize: number
  total: number
  className?: string
  prevHref?: string
  nextHref?: string
  onPrev?: () => void
  onNext?: () => void
}) {
  const t = useTranslations('pagination')
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  if (lastPage <= 1) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const hasPrev = page > 1
  const hasNext = page < lastPage

  const arrow = (enabled: boolean, href: string | undefined, onClick: (() => void) | undefined, label: string) =>
    enabled && href !== undefined ? (
      <Button variant="outline" size="sm" asChild aria-label={label}>
        <Link href={href}>{label}</Link>
      </Button>
    ) : (
      <Button variant="outline" size="sm" aria-label={label} disabled={!enabled} onClick={onClick}>
        {label}
      </Button>
    )

  return (
    <nav
      className={cn('flex items-center justify-between gap-4 text-sm', className)}
      aria-label={t('label')}
    >
      <span className="text-muted-foreground" role="status">
        {t('pageStatus', { from, to, total })}
      </span>
      <div className="flex items-center gap-2">
        {arrow(hasPrev, prevHref, onPrev, t('prev'))}
        {arrow(hasNext, nextHref, onNext, t('next'))}
      </div>
    </nav>
  )
}
