import { useTranslations } from 'next-intl'
import { countMessage } from '@/lib/page-range'
import { cn } from '@/lib/utils'

/**
 * The single result-count look for every paged card list: "1-24 of 604 cards"
 * while the results span more than one page, and the plain total once they all
 * fit on one. Decks phrase the same two messages from their own namespace in
 * deck-browse; countMessage() owns the choice between them.
 */
export function useResultCountText(page: number, pageSize: number, total: number) {
  const t = useTranslations('search')
  const message = countMessage(page, pageSize, total)
  return message.ranged ? t('resultRange', message.values) : t('results', message.values)
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
