'use client'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { parseSearchParams, withParams } from '@/lib/search-params'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CollectionSetNav } from '@/components/collection/collection-set-nav'
import { CollectionCardTile, type CollectionCard } from '@/components/collection/collection-card-tile'
import { CollectionFilterDrawer } from '@/components/collection/collection-filter-drawer'
import { ClearFiltersButton } from '@/components/search/clear-filters-button'
import { SearchBox } from '@/components/search/search-box'
import { Pagination } from '@/components/search/pagination'
import { ResultCount } from '@/components/search/result-count'
import { EmptyResults } from '@/components/empty-results'
import { Button } from '@/components/ui/button'
import type { SetDTO, SetProgress, OwnedQuantities } from '@revelio/core'

export function CollectionView({
  sets, progress, selectedSet, cards, browseCards, quantities, editable, locale, mode,
  browseTotal, browsePage, browsePageSize,
}: {
  sets: SetDTO[]
  progress: SetProgress[]
  selectedSet: string
  cards: CollectionCard[]        // cards of the selected set (By set mode)
  browseCards: CollectionCard[]  // flat search results (Browse all mode)
  quantities: OwnedQuantities
  editable: boolean
  locale: string
  mode: 'sets' | 'browse'
  browseTotal: number
  browsePage: number
  browsePageSize: number
}) {
  const t = useTranslations('collection')
  const tf = useTranslations('filters')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // Tabs are URL-driven so the search box and pagination (which write to the
  // URL) keep the browse tab active instead of snapping back to the default.
  // `set` is the By-set sidebar selection and must not leak into Browse (which
  // has its own Set filter), so drop it when entering Browse.
  function onTab(value: string) {
    const patch: Record<string, string | null> = { tab: value }
    if (value === 'browse') patch.set = null
    const next = withParams(new URLSearchParams(params.toString()), patch)
    router.push(`${pathname}?${next.toString()}`)
  }

  // Browse-tab filter state: the shared advanced filters plus the collection's
  // own ownership facet. Clearing drops them all in one navigation while keeping
  // the search query, sort and the browse tab.
  const browseState = parseSearchParams(new URLSearchParams(params.toString()))
  const hasFilters =
    browseState.types.length > 0 ||
    browseState.lessons.length > 0 ||
    browseState.rarities.length > 0 ||
    browseState.finishes.length > 0 ||
    browseState.legalities.length > 0 ||
    Boolean(browseState.set) ||
    browseState.costMin != null ||
    browseState.costMax != null ||
    browseState.official !== null ||
    params.get('owned') != null

  function clearFilters() {
    const next = withParams(new URLSearchParams(params.toString()), {
      type: null, lesson: null, rarity: null, finish: null, legality: null,
      set: null, costMin: null, costMax: null, official: null, owned: null,
    })
    router.push(`${pathname}?${next.toString()}`)
  }

  // Column breakpoints use arbitrary min-[] values (not sm:/md:) on purpose:
  // Tailwind v4 orders named breakpoint utilities AFTER arbitrary min-[] ones, so a
  // named md:grid-cols-4 would win over min-[1780px]:grid-cols-5 at every width. Keep
  // them all min-[] so they cascade by ascending width. 640/768 mirror sm/md; 5-up is
  // tied to the 1780px gutter breakpoint below (where the card column is full-width).
  const grid = (list: CollectionCard[]) => (
    <ul className="grid grid-cols-2 gap-3 min-[640px]:grid-cols-3 min-[768px]:grid-cols-4 min-[1780px]:grid-cols-5">
      {list.map((c) => (
        <li key={c.id}>
          <CollectionCardTile card={c} quantities={quantities[c.id] ?? {}} editable={editable} locale={locale} />
        </li>
      ))}
    </ul>
  )
  return (
    <Tabs value={mode} onValueChange={onTab}>
      <TabsList className="mb-4 p-0.5">
        <TabsTrigger value="sets" className="px-5 text-sm">{t('bySets')}</TabsTrigger>
        <TabsTrigger value="browse" className="px-5 text-sm">{t('browseAll')}</TabsTrigger>
      </TabsList>

      <TabsContent value="sets">
        {/* Gutter layout: content stays anchored to the 76rem container; at >=1780px
            the row is pulled 18rem into the LEFT gutter (-ml-72) so the 16rem sidebar
            + 2rem gap hangs outside while the card column keeps full width. The
            breakpoint is 1780 (not the admin layout's 1700) because the pull here is
            18rem vs admin's 14rem: at 1700px the gutter is only ~16.6rem, so an 18rem
            pull would spill past the left viewport edge. 1780px is the smallest width
            where the gutter can hold 18rem with a little breathing room. Below 1024px
            it stacks into a Sheet drawer. */}
        <div className="flex flex-col gap-4 min-[1024px]:flex-row min-[1024px]:gap-8 min-[1780px]:-ml-72 min-[1780px]:w-[calc(100%+18rem)]">
          <CollectionSetNav sets={sets} progress={progress} selected={selectedSet}
            hrefFor={(c) => `?tab=sets&set=${c}`} />
          <section className="min-w-0 flex-1 min-[1024px]:max-w-[76rem]">
            {cards.length ? grid(cards) : (
              <EmptyResults
                heading={t('emptySet.heading')}
                description={t('emptySet.description')}
              />
            )}
          </section>
        </div>
      </TabsContent>

      <TabsContent value="browse">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SearchBox placeholder={t('searchPlaceholder')} className="w-full sm:w-1/2" />
          <div className="ml-auto">
            <CollectionFilterDrawer sets={sets} locale={locale} />
          </div>
        </div>
        {/* Clearing sits with the count, as it does on /search. */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <ResultCount page={browsePage} pageSize={browsePageSize} total={browseTotal} />
          <ClearFiltersButton active={hasFilters} onClear={clearFilters} />
        </div>
        {browseCards.length ? grid(browseCards) : (
          <EmptyResults
            heading={t('emptyBrowse.heading')}
            description={t('emptyBrowse.description')}
          >
            {hasFilters ? (
              <Button onClick={clearFilters}>{tf('clearFilters')}</Button>
            ) : null}
          </EmptyResults>
        )}
        <Pagination
          page={browsePage}
          total={browseTotal}
          hitsPerPage={browsePageSize}
          current={new URLSearchParams(params.toString())}
          basePath={pathname}
        />
      </TabsContent>
    </Tabs>
  )
}
