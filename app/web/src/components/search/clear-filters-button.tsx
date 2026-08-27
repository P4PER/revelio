'use client'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'

// Shared inline "Clear filters" control, used by the search, deck-builder and
// discover pages. Renders only when a filter is active; each page owns its own
// active-check and reset handler since their filter state models differ (URL
// params vs local state). It carries a visible label rather than a bare icon:
// it appears at the end of a run of active-filter chips, where a labelled
// action reads as part of that run instead of a control popping into place.
export function ClearFiltersButton({
  active,
  onClear,
}: {
  active: boolean
  onClear: () => void
}) {
  const t = useTranslations('filters')
  if (!active) return null
  return (
    <Button
      variant="link"
      size="sm"
      // Muted rather than the link variant's gold: it sits beside the result
      // count and the filter chips, and should not outrank either.
      className="text-muted-foreground hover:text-foreground"
      onClick={onClear}
    >
      {t('clearFilters')}
    </Button>
  )
}
