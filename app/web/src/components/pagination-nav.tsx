'use client'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Link } from '@/../i18n/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * The single pagination look for the whole app: chevron controls flanking a
 * "Page X of Y" label, centered, with prev/next hidden (a spacer holds their
 * place) at the first/last page. Renders nothing for a single page.
 *
 * Two modes, so it works from both server pages and client tables:
 * - link mode: pass `prevHref`/`nextHref` (server-safe — strings, no closures)
 * - button mode: pass `onPrev`/`onNext` (client callers: tanstack tables, browse)
 */
export function PaginationNav({
  page, lastPage, className, prevHref, nextHref, onPrev, onNext,
}: {
  page: number
  lastPage: number
  className?: string
  prevHref?: string
  nextHref?: string
  onPrev?: () => void
  onNext?: () => void
}) {
  const t = useTranslations('pagination')
  if (lastPage <= 1) return null

  const spacer = <span aria-hidden className="inline-block w-9" />

  return (
    <nav className={cn('flex items-center justify-center gap-4 text-sm', className)} aria-label={t('label')}>
      {page > 1 ? (
        prevHref !== undefined ? (
          <Button variant="outline" size="sm" asChild aria-label={t('prev')}>
            <Link href={prevHref}><ChevronLeft className="size-4" /></Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" aria-label={t('prev')} onClick={onPrev}>
            <ChevronLeft className="size-4" />
          </Button>
        )
      ) : spacer}

      <span className="text-muted-foreground">{t('pageOf', { page, total: lastPage })}</span>

      {page < lastPage ? (
        nextHref !== undefined ? (
          <Button variant="outline" size="sm" asChild aria-label={t('next')}>
            <Link href={nextHref}><ChevronRight className="size-4" /></Link>
          </Button>
        ) : (
          <Button variant="outline" size="sm" aria-label={t('next')} onClick={onNext}>
            <ChevronRight className="size-4" />
          </Button>
        )
      ) : spacer}
    </nav>
  )
}
