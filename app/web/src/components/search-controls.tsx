import { getTranslations } from 'next-intl/server'
import type { SetDTO } from '@revelio/core'
import { SearchBox } from './search-box'
import { SortSelect } from './sort-select'
import { FilterDrawer } from './filter-drawer'
import { ActiveFilters } from './active-filters'

export async function SearchControls({ locale, sets }: { locale: string; sets: SetDTO[] }) {
  const t = await getTranslations('search')
  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchBox placeholder={t('placeholder')} />
        </div>
        <FilterDrawer sets={sets} locale={locale} />
        <SortSelect />
      </div>
      <ActiveFilters sets={sets} locale={locale} />
    </div>
  )
}
