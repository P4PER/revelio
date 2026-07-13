'use client'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

// Shared inline "Clear filters" control, used by the search, deck-builder and
// discover pages. Renders only when a filter is active; each page owns its own
// active-check and reset handler since their filter state models differ (URL
// params vs local state).
export function ClearFiltersButton({ active, onClear }: { active: boolean; onClear: () => void }) {
  const t = useTranslations('filters')
  if (!active) return null
  return (
    <Button variant="ghost" size="sm" onClick={onClear}>{t('clearFilters')}</Button>
  )
}
