import type { SetDTO } from '@revelio/core'
import { FilterDrawer } from '@/components/filter-drawer'
import { QuickFilters } from '@/components/quick-filters'
import { ActiveFilters } from '@/components/active-filters'
import { ClearFilters } from '@/components/clear-filters'

export function SearchControls({ locale, sets }: { locale: string; sets: SetDTO[] }) {
  return (
    <div className="mb-6 space-y-4">
      <div className="w-fit space-y-3">
        <div className="flex items-center gap-3">
          <FilterDrawer sets={sets} locale={locale} />
          <ClearFilters />
        </div>
        <div className="h-px w-full bg-border/60" aria-hidden />
      </div>
      <QuickFilters locale={locale} />
      <ActiveFilters sets={sets} locale={locale} />
    </div>
  )
}
