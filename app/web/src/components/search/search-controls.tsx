import type { SetDTO } from '@revelio/core'
import { FilterDrawer } from '@/components/search/filter-drawer'
import { QuickFilters } from '@/components/search/quick-filters'

// Filter block above the results: the labelled facet lanes with the advanced
// trigger at their top right, closed by a full-width rule that separates
// filtering from the results. The active advanced filters and the clear
// control live one row further down, in the results bar next to the count, so
// nothing in this block resizes as filters come and go.
export function SearchControls({ locale, sets }: { locale: string; sets: SetDTO[] }) {
  return (
    <div className="mb-5 space-y-5">
      <QuickFilters locale={locale} trailing={<FilterDrawer sets={sets} locale={locale} />} />
      <div className="h-px w-full bg-border/60" aria-hidden />
    </div>
  )
}
