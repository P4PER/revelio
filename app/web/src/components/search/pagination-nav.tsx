'use client'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { pageRange } from '@/lib/page-range'
import { cn } from '@/lib/utils'

/**
 * The single pagination look for the whole app: the record range on the left
 * and Previous / Next buttons on the right. Buttons disable
 * (rather than disappear) at the first/last page so the controls stay put.
 * Renders nothing when everything fits on a single page.
 *
 * The range reads "Showing X–Y of Z" unless the caller passes `status`, which
 * card lists use to repeat their header verbatim ("X–Y of Z cards"). Callers
 * without a header of their own - the admin tables - keep the default, where
 * naming a record type would be wrong.
 *
 * The range is a live region unless `announcedByHeader` says a header above the
 * list already announces the same sentence - two live regions with identical
 * text read it out twice per page change. Passing `status` alone is not that
 * claim: the set page passes one while its own header describes the set, not
 * the records on screen.
 *
 * Two modes, so it works from both server pages and client tables:
 * - link mode: pass `prevHref`/`nextHref` (server-safe — strings, no closures)
 * - button mode: pass `onPrev`/`onNext` (client callers: tanstack tables, browse)
 */
export function PaginationNav({
  page, pageSize, total, className, status, announcedByHeader, prevHref, nextHref, onPrev, onNext,
}: {
  page: number
  pageSize: number
  total: number
  className?: string
  status?: string
  announcedByHeader?: boolean
  prevHref?: string
  nextHref?: string
  onPrev?: () => void
  onNext?: () => void
}) {
  const t = useTranslations('pagination')
  const { from, to, lastPage } = pageRange(page, pageSize, total)
  if (lastPage <= 1) return null

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
      <span className="text-muted-foreground" role={announcedByHeader ? undefined : 'status'}>
        {status ?? t('pageStatus', { from, to, total })}
      </span>
      <div className="flex items-center gap-2">
        {arrow(hasPrev, prevHref, onPrev, t('prev'))}
        {arrow(hasNext, nextHref, onNext, t('next'))}
      </div>
    </nav>
  )
}
