'use client'
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { PanelBottom, Layers } from 'lucide-react'
import { useRouter, usePathname } from '@/../i18n/navigation'
import { parseSearchParams, withParams } from '@/lib/search-params'
import { STEPPER_LAYOUT_COOKIE, type StepperLayout } from '@/lib/collection-prefs'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { CollectionSidebar } from '@/components/collection-sidebar'
import { CollectionCardTile, type CollectionCard } from '@/components/collection-card-tile'
import { CollectionFilterDrawer } from '@/components/collection-filter-drawer'
import { ClearFiltersButton } from '@/components/clear-filters-button'
import { SearchBox } from '@/components/search-box'
import { Pagination } from '@/components/pagination'
import type { SetDTO, SetProgress, OwnedQuantities } from '@revelio/core'

export function CollectionView({
  sets, progress, selectedSet, cards, browseCards, quantities, editable, locale, mode,
  browseTotal, browsePage, browsePageSize, stepperLayout = 'panel',
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
  stepperLayout?: StepperLayout
}) {
  const t = useTranslations('collection')
  const tSearch = useTranslations('search')
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  // Stepper layout is a persisted per-user setting: initial value comes from the
  // cookie (server-read), and the toggle flips it live and rewrites the cookie.
  const [layout, setLayout] = useState<StepperLayout>(stepperLayout)
  function setLayoutPref(next: StepperLayout) {
    setLayout(next)
    document.cookie = `${STEPPER_LAYOUT_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
  }

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

  const grid = (list: CollectionCard[]) => (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {list.map((c) => (
        <li key={c.id}>
          <CollectionCardTile card={c} quantities={quantities[c.id] ?? {}} editable={editable} locale={locale} stepperLayout={layout} />
        </li>
      ))}
    </ul>
  )
  return (
    <Tabs value={mode} onValueChange={onTab}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <TabsList className="h-9 p-0.5">
          <TabsTrigger value="sets" className="px-5 text-sm">{t('bySets')}</TabsTrigger>
          <TabsTrigger value="browse" className="px-5 text-sm">{t('browseAll')}</TabsTrigger>
        </TabsList>
        {editable && (
          <div className="flex items-center gap-1" role="group" aria-label={t('layoutLabel')}>
            <Button variant={layout === 'panel' ? 'secondary' : 'ghost'} size="icon-sm"
              onClick={() => setLayoutPref('panel')} aria-label={t('layoutUnder')} title={t('layoutUnder')}>
              <PanelBottom className="size-4" />
            </Button>
            <Button variant={layout === 'overlay' ? 'secondary' : 'ghost'} size="icon-sm"
              onClick={() => setLayoutPref('overlay')} aria-label={t('layoutHover')} title={t('layoutHover')}>
              <Layers className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <TabsContent value="sets">
        <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
          <aside className="md:sticky md:top-6 md:self-start md:max-h-[calc(100vh-3rem)] md:overflow-y-auto">
            <CollectionSidebar sets={sets} progress={progress} selected={selectedSet}
              hrefFor={(c) => `?tab=sets&set=${c}`} />
          </aside>
          <section className="hidden md:block">
            {cards.length ? grid(cards) : <p className="text-muted-foreground">{t('empty')}</p>}
          </section>
        </div>
      </TabsContent>

      <TabsContent value="browse">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SearchBox placeholder={t('searchPlaceholder')} className="h-9 w-full sm:w-1/2" />
          <div className="ml-auto flex items-center gap-2">
            <ClearFiltersButton active={hasFilters} onClear={clearFilters} size="default" />
            <CollectionFilterDrawer sets={sets} locale={locale} />
          </div>
        </div>
        <p className="mb-4 text-sm text-muted-foreground" role="status">
          {tSearch('results', { count: browseTotal })}
        </p>
        {browseCards.length ? grid(browseCards) : <p className="text-muted-foreground">{t('empty')}</p>}
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
