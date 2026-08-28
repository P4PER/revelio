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
      // No size: every size preset carries a fixed height, and on rows that
      // hold nothing but the result count (the deck builder's browse panel,
      // the collection's Browse tab) that box would set the row's height, so
      // applying a filter would grow the row and shove the grid below it down.
      // h-auto plus px-0 makes the control exactly as tall and wide as its own
      // label; horizontal spacing comes from the row's gap.
      //
      // py-1.5 with a matching -my-1.5 grows the pointer target back to 32px
      // without the padding counting towards the row: the negative margin
      // cancels it in the flex row's height, so the box overflows into the
      // gaps above and below. The two values must stay equal and opposite -
      // e2e/clear-filters.spec.ts measures both the row and the target.
      //
      // Color is the link variant's own primary ink, not muted: the control
      // sits immediately beside the muted result count, and sharing that color
      // made it read as part of the count rather than as the action it is.
      className="h-auto px-0 py-1.5 -my-1.5"
      onClick={onClear}
    >
      {t('clearFilters')}
    </Button>
  )
}
