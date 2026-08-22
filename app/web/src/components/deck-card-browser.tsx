'use client'
import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { deckCardMeta, imageUrl, thumbKey } from '@revelio/core'
import type { DeckCardView, DeckFormat, DeckZone, SetDTO } from '@revelio/core'
import type { SearchDocument, SearchResult } from '@revelio/search'
import { searchDeckCards } from '@/lib/actions/deck-actions'
import { DECK_BROWSE_PAGE_SIZE } from '@/lib/deck-view'
import { LessonFilter } from '@/components/lesson-filter'
import { ClearFiltersButton } from '@/components/clear-filters-button'
import { cn } from '@/lib/utils'
import { SearchField } from '@/components/search-field'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { CardDetailSheet } from '@/components/card/card-detail-sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { CardInfoButton } from '@/components/card/card-info-button'
import { CardRotate } from '@/components/card/card-rotate'
import { DeckFilterDrawer, EMPTY_DECK_FILTERS, type DeckFilters } from '@/components/deck-filter-drawer'
import { PaginationNav } from '@/components/pagination-nav'

const EMPTY_RESULT: SearchResult = { hits: [], total: 0, page: 1, hitsPerPage: DECK_BROWSE_PAGE_SIZE }
const DEBOUNCE_MS = 300

function toAddView(hit: SearchDocument): Omit<DeckCardView, 'zone' | 'quantity'> {
  const meta = deckCardMeta({
    id: hit.id,
    isOfficial: hit.isOfficial,
    legality: hit.legality,
    types: hit.types,
    subTypes: hit.subTypes,
  })
  return {
    cardId: hit.id,
    name: hit.name,
    cost: hit.cost,
    damage: hit.damage ?? null,
    types: hit.types,
    setCode: hit.setCode,
    number: hit.number,
    lesson: hit.lesson,
    isOfficial: meta.isOfficial,
    legality: meta.legality,
    isLesson: meta.isLesson,
    isStartingCharacter: meta.isStartingCharacter,
    // Carried so a card added in this session sizes its detail skeleton the
    // same as one loaded from the server, where getCardViews supplies it.
    orientation: hit.orientation,
    // DeckCardView.imageVersion is the *default-language* thumb version (deck-gallery
    // renders a no-lang thumb key). The hit only carries the effective image lang, so
    // only adopt its version when that lang is the default; otherwise leave it null.
    imageVersion: hit.imageLang === hit.defaultLanguage ? hit.imageVersion : null,
    // Card-level crop version carried on every language document; drives the
    // starting-character art in the deck panel (DeckArt gates on it being non-null).
    artCropVersion: hit.artCropVersion,
  }
}

// Search box + lesson/cost/set filters + a result grid of card tiles with a
// hover/focus "+ Add". Calls the searchDeckCards server action (debounced) on
// every query/filter/format change; Classic restricts the pool to official
// sets server-side, Revival shows everything but flags/blocks banned cards.
export function DeckCardBrowser({
  format,
  imageBase,
  sets,
  copyLimitReached,
  onAdd,
}: {
  format: DeckFormat
  imageBase: string
  sets: SetDTO[]
  copyLimitReached: (cardId: string, isLesson: boolean) => boolean
  onAdd: (view: Omit<DeckCardView, 'zone' | 'quantity'>, zone: DeckZone) => void
}) {
  const t = useTranslations('decks')
  const locale = useLocale()
  const [query, setQuery] = useState('')
  const [lessons, setLessons] = useState<string[]>([])
  const [filters, setFilters] = useState<DeckFilters>(EMPTY_DECK_FILTERS)
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<SearchResult>(EMPTY_RESULT)
  // Starts true: the first search only fires after the debounce, and until it
  // lands the grid has nothing to show - without this the browser would open on
  // "No cards found." instead of a loading state.
  const [pending, setPending] = useState(true)
  const [detail, setDetail] = useState<{ id: string; orientation?: string | null } | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqId = useRef(0)
  const gridRef = useRef<HTMLDivElement>(null)
  const scrollTopPending = useRef(false)

  // Any change to the filters should strand the user back on page 1 rather
  // than leaving them on a page that may no longer exist for the new result set.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPage(1) }, [query, format, lessons, filters])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    // Loading starts when the inputs change, not when the debounced request
    // finally fires: otherwise an empty result set flashes "No cards found."
    // for the length of the debounce before the ghosts come up.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPending(true)
    timer.current = setTimeout(() => {
      const id = ++reqId.current
      searchDeckCards(locale, {
        query,
        format,
        lessons,
        set: filters.set || undefined,
        types: filters.types,
        rarities: filters.rarities,
        finishes: filters.finishes,
        legalities: filters.legalities,
        costMin: filters.costMin,
        costMax: filters.costMax,
        page,
      })
        .then((r) => {
          if (id === reqId.current) { setResult(r); setPending(false) }
        })
        .catch(() => {
          if (id === reqId.current) setPending(false)
        })
    }, DEBOUNCE_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [query, format, lessons, filters, page, locale])

  // After a page navigation, jump the grid back to the top — but only once the
  // new results have rendered, so we land on the first card of the new page
  // rather than scrolling the old page before it swaps out.
  useEffect(() => {
    if (!scrollTopPending.current) return
    scrollTopPending.current = false
    gridRef.current?.scrollTo({ top: 0 })
  }, [result])

  // Ghost tiles stand in only while there is nothing to show; once results are
  // on screen they stay put across a refetch rather than flashing back to bones.
  const showSkeleton = pending && result.hits.length === 0

  function toggleLesson(code: string) {
    setLessons((ls) => (ls.includes(code) ? ls.filter((c) => c !== code) : [...ls, code]))
  }

  // "Clear filters" resets the lessons and advanced filters but keeps the
  // search text, matching the search and discover pages.
  const filtersActive =
    lessons.length > 0 ||
    Boolean(filters.set) ||
    filters.types.length > 0 ||
    filters.rarities.length > 0 ||
    filters.finishes.length > 0 ||
    filters.legalities.length > 0 ||
    filters.costMin != null ||
    filters.costMax != null

  function clearFilters() {
    setLessons([])
    setFilters(EMPTY_DECK_FILTERS)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2.5 border-b border-border/60 px-4 py-3">
        <SearchField
          primary
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('browse.searchPlaceholder', { format: t(`format.${format}`) })}
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <LessonFilter selected={lessons} onToggle={toggleLesson} />
          <div className="ml-auto flex items-center gap-1.5">
            <ClearFiltersButton active={filtersActive} onClear={clearFilters} />
            <DeckFilterDrawer sets={sets} value={filters} onApply={setFilters} />
          </div>
        </div>
        {/* The live region stays mounted across a search so a new count reaches
            screen readers as an update to its text; swapping it for the ghost
            would remount it already populated, which most of them never
            announce. A div rather than a p because the ghost is a block. */}
        <div className="text-xs text-muted-foreground" role="status">
          {showSkeleton ? (
            <Skeleton className="h-4 w-20" />
          ) : (
            t('browse.resultCount', { count: result.total })
          )}
        </div>
      </div>

      <div
        ref={gridRef}
        className="grid flex-1 auto-rows-min gap-4 overflow-y-auto px-4 py-3 [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]"
        role={showSkeleton ? 'status' : undefined}
        aria-label={showSkeleton ? t('browse.loading') : undefined}
        aria-busy={showSkeleton || undefined}
      >
        {/* One ghost per card a full page holds, so the loading grid is exactly
            as deep as the grid that replaces it. */}
        {showSkeleton &&
          Array.from({ length: result.hitsPerPage }, (_, i) => (
            <Skeleton key={i} className="aspect-[5/7] w-full rounded-lg" />
          ))}
        {result.hits.length === 0 && !pending && (
          <p className="col-span-full py-10 text-center text-sm text-muted-foreground" role="status">
            {t('browse.noResults')}
          </p>
        )}
        {result.hits.map((hit) => {
          const view = toAddView(hit)
          const banned = format === 'revival' && hit.legality === 'banned'
          const zoneBlocked = copyLimitReached(hit.id, view.isLesson)
          return (
            <div key={hit.id} className="group relative overflow-hidden rounded-lg border border-border/60 bg-card">
              <div className={cn('relative aspect-[5/7] bg-muted', banned && 'grayscale brightness-75')}>
                {hit.imageLang ? (
                  <CardRotate
                    src={imageUrl(imageBase, thumbKey(hit.id, hit.imageVersion!, hit.imageLang, hit.defaultLanguage))}
                    alt={hit.name}
                    orientation={hit.orientation}
                    sizes="(max-width: 640px) 45vw, 160px"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                    {hit.name}
                  </div>
                )}
                <div
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/85 via-transparent to-transparent"
                  aria-hidden
                />
                {banned && (
                  <span className="absolute top-2 left-1/2 -translate-x-1/2 -rotate-6 rounded bg-destructive px-2 py-0.5 text-[0.6rem] font-bold tracking-wide text-white uppercase">
                    {t('browse.banned')}
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 px-2 py-1.5">
                  <div className="line-clamp-2 text-sm font-semibold text-foreground">{hit.name}</div>
                  <div className="text-xs tracking-wide text-muted-foreground uppercase">{hit.setCode} · #{hit.number}</div>
                </div>
              </div>

              <div
                className="pointer-events-none absolute inset-0 bg-background/45 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                aria-hidden
              />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    size="sm"
                    disabled={banned}
                    aria-label={t('browse.addAria', { name: hit.name })}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 touch:opacity-100"
                  >
                    {t('browse.add')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center">
                  {view.isStartingCharacter && (
                    <DropdownMenuItem onSelect={() => onAdd(view, 'character')}>
                      {t('browse.addToCharacter')}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem disabled={zoneBlocked} onSelect={() => onAdd(view, 'main')}>
                    {t('browse.addToMain')}
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={zoneBlocked} onSelect={() => onAdd(view, 'sideboard')}>
                    {t('browse.addToSideboard')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <CardInfoButton
                label={t('browse.infoAria', { name: hit.name })}
                onClick={() => setDetail({ id: hit.id, orientation: hit.orientation })}
              />
            </div>
          )
        })}
      </div>

      <PaginationNav
        page={result.page}
        pageSize={result.hitsPerPage}
        total={result.total}
        className="border-t border-border/60 px-4 py-2"
        onPrev={() => { setPage((p) => Math.max(1, p - 1)); scrollTopPending.current = true }}
        onNext={() => { setPage((p) => p + 1); scrollTopPending.current = true }}
      />

      <CardDetailSheet
        cardId={detail?.id ?? null}
        orientation={detail?.orientation}
        imageBase={imageBase}
        onOpenChange={(open) => { if (!open) setDetail(null) }}
      />
    </div>
  )
}
