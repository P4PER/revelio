import { useTranslations } from 'next-intl'
import { pageRange } from '@/lib/page-range'
import { cn } from '@/lib/utils'

/**
 * The single result-count look for every paged card list: "1-24 of 604 cards"
 * while the results span more than one page, and the plain total once they all
 * fit on one - the same threshold the pagination bar uses to hide itself, so a
 * short list never carries a range with no pagination under it.
 */
export function useResultCountText(page: number, pageSize: number, total: number) {
  const t = useTranslations('search')
  const { from, to, lastPage } = pageRange(page, pageSize, total)
  return lastPage > 1 ? t('resultRange', { from, to, total }) : t('results', { count: total })
}

export function ResultCount({
  page, pageSize, total, className,
}: {
  page: number
  pageSize: number
  total: number
  className?: string
}) {
  const text = useResultCountText(page, pageSize, total)
  return (
    <p className={cn('text-sm text-muted-foreground', className)} role="status">
      {text}
    </p>
  )
}
