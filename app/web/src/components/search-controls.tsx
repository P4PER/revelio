import type { SetDTO } from '@revelio/core'
import { SortSelect } from './sort-select'
import { FilterDrawer } from './filter-drawer'
import { QuickFilters } from './quick-filters'
import { ActiveFilters } from './active-filters'

export function SearchControls({ locale, sets }: { locale: string; sets: SetDTO[] }) {
  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <FilterDrawer sets={sets} locale={locale} />
        <SortSelect />
      </div>
      <div className="h-px bg-border/60" aria-hidden />
      <QuickFilters locale={locale} />
      <ActiveFilters sets={sets} locale={locale} />
    </div>
  )
}
