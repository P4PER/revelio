import { getTranslations } from 'next-intl/server'
import { SearchBox } from './search-box'
import { QuickFilters } from './quick-filters'
import { SortSelect } from './sort-select'

export async function SearchControls({ locale }: { locale: string }) {
  const t = await getTranslations('search')
  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchBox placeholder={t('placeholder')} />
        </div>
        <SortSelect />
      </div>
      <QuickFilters locale={locale} />
    </div>
  )
}
