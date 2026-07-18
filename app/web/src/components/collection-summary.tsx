import { useTranslations } from 'next-intl'
import type { CollectionSummary as Summary } from '@revelio/core'

export function CollectionSummary({ summary }: { summary: Summary }) {
  const t = useTranslations('collection')
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-muted-foreground">
      <span className="text-base font-semibold text-foreground">
        {t('distinct', { owned: summary.distinctOwned, total: summary.totalCards })}
      </span>
      <span>{t('copies', { count: summary.totalCopies })}</span>
    </div>
  )
}
