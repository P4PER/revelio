'use client'
import { useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
 * A passed-in `status` also gives up the live region: it was copied from a
 * header that announces it already, and two live regions with the same text
 * read the sentence out twice per page change. Every list that renders its own
 * count header passes one; the ones that do not keep the default and announce
 * from here. `status={null}` is the third case: the caller renders the count as
 * its own sibling element, so this drops the status slot entirely and is just
 * the controls.
 *
 * `compactLabel` folds the Previous/Next labels down to chevrons below md and
 * puts a "page / lastPage" readout between them - same prop name and meaning it
 * has on DeckExportMenu. It exists for the deck builder's browse pane, which is
 * a single 402px column on a phone; aria-label carries the accessible name
 * either way, and from md up it is the labelled pair, unchanged.
 *
 * Two modes, so it works from both server pages and client tables:
 * - link mode: pass `prevHref`/`nextHref` (server-safe — strings, no closures)
 * - button mode: pass `onPrev`/`onNext` (client callers: tanstack tables, browse)
 */
export function PaginationNav({
  page, pageSize, total, className, status, compactLabel,
  prevHref, nextHref, onPrev, onNext,
}: {
  page: number
  pageSize: number
  total: number
  className?: string
  /** Text for the status slot; `null` drops the slot for a caller that owns the count. */
  status?: string | null
  compactLabel?: boolean
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

  // One button per direction at every width: the label folds to a chevron
  // rather than a second control appearing, which is how the export menu does
  // it too. aria-label carries the name whichever half is painted.
  const face = (label: string, Icon: typeof ChevronLeft) => (
    <>
      {compactLabel && <Icon className="size-4 md:hidden" />}
      <span className={cn(compactLabel && 'max-md:hidden')}>{label}</span>
    </>
  )

  const arrow = (
    enabled: boolean,
    href: string | undefined,
    onClick: (() => void) | undefined,
    label: string,
    Icon: typeof ChevronLeft,
  ) =>
    enabled && href !== undefined ? (
      <Button variant="outline" size="sm" asChild aria-label={label}>
        <Link href={href}>{face(label, Icon)}</Link>
      </Button>
    ) : (
      <Button variant="outline" size="sm" aria-label={label} disabled={!enabled} onClick={onClick}>
        {face(label, Icon)}
      </Button>
    )

  return (
    <nav
      className={cn('flex items-center justify-between gap-4 text-sm', className)}
      aria-label={t('label')}
    >
      {status !== null && (
        <span className="text-muted-foreground" role={status ? undefined : 'status'}>
          {status ?? t('pageStatus', { from, to, total })}
        </span>
      )}
      <div className="flex items-center gap-2">
        {arrow(hasPrev, prevHref, onPrev, t('prev'), ChevronLeft)}
        {/* Which page you are on is the one thing the folded labels stop
            telling you, so the chevrons get a readout between them. */}
        {compactLabel && (
          <span className="shrink-0 tabular-nums text-muted-foreground md:hidden">
            {t('pageOf', { page, lastPage })}
          </span>
        )}
        {arrow(hasNext, nextHref, onNext, t('next'), ChevronRight)}
      </div>
    </nav>
  )
}
