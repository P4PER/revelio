'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { Info, Search } from 'lucide-react'
import { deckCardMeta, imageKey, imageUrl, thumbKey } from '@revelio/core'
import type { DeckCardView, DeckFormat, DeckZone, SetDTO } from '@revelio/core'
import type { SearchDocument, SearchResult } from '@revelio/search'
import { searchDeckCards } from '@/lib/deck-actions'
import { LessonFilterChips } from '@/components/lesson-filter-chips'
import { ClearFiltersButton } from '@/components/clear-filters-button'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { CardDetailSheet } from '@/components/card-detail-sheet'
import { CardRotate } from '@/components/card-rotate'
import { DeckFilterDrawer, EMPTY_DECK_FILTERS, type DeckFilters } from '@/components/deck-filter-drawer'

const EMPTY_RESULT: SearchResult = { hits: [], total: 0, page: 1, hitsPerPage: 24 }
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
    setCode: hit.setCode,
    number: hit.number,
    lesson: hit.lesson,
    isOfficial: meta.isOfficial,
    legality: meta.legality,
    isLesson: meta.isLesson,
    isStartingCharacter: meta.isStartingCharacter,
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
  const [pending, setPending] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqId = useRef(0)

  // Any change to the filters should strand the user back on page 1 rather
  // than leaving them on a page that may no longer exist for the new result set.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setPage(1) }, [query, format, lessons, filters])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const id = ++reqId.current
      setPending(true)
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
      <div className="flex flex-col gap-2.5 border-b border-border/60 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('browse.searchPlaceholder', { format: t(`format.${format}`) })}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <LessonFilterChips selected={lessons} onToggle={toggleLesson} size="sm" />
          <div className="ml-auto flex items-center gap-1.5">
            <ClearFiltersButton active={filtersActive} onClear={clearFilters} />
            <DeckFilterDrawer sets={sets} value={filters} onApply={setFilters} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground" role="status">
          {t('browse.resultCount', { count: result.total })}
        </p>
      </div>

      <div className="grid flex-1 auto-rows-min gap-4 overflow-y-auto p-3 [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]">
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
              <div data-card-frame className={cn('relative aspect-[5/7] bg-muted', banned && 'grayscale brightness-75')}>
                {hit.imageLang ? (
                  <Image
                    src={imageUrl(imageBase, thumbKey(hit.id, hit.imageLang, hit.defaultLanguage))}
                    alt={hit.name}
                    fill
                    sizes="(max-width: 640px) 45vw, 160px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground">
                    {hit.name}
                  </div>
                )}
                {hit.imageLang && (
                  <CardRotate
                    src={imageUrl(imageBase, imageKey(hit.id, hit.imageLang, hit.defaultLanguage))}
                    alt={hit.name}
                    orientation={hit.orientation}
                    sizes="400px"
                  />
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
                  <div className="line-clamp-2 text-xs font-semibold text-foreground">{hit.name}</div>
                  <div className="text-[0.62rem] tracking-wide text-muted-foreground uppercase">{hit.setCode}</div>
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
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
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

              <Button
                type="button"
                size="icon-sm"
                variant="secondary"
                aria-label={t('browse.infoAria', { name: hit.name })}
                onClick={() => setDetailId(hit.id)}
                className="absolute top-1.5 right-1.5 opacity-0 shadow transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              >
                <Info />
              </Button>
            </div>
          )
        })}
      </div>

      {result.total > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-3 py-2">
          <p className="text-xs text-muted-foreground" role="status">
            {t('browse.pageStatus', {
              from: (result.page - 1) * result.hitsPerPage + 1,
              to: Math.min(result.page * result.hitsPerPage, result.total),
              total: result.total,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={result.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t('browse.prev')}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={result.page >= Math.ceil(result.total / result.hitsPerPage)}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('browse.next')}
            </Button>
          </div>
        </div>
      )}

      <CardDetailSheet
        cardId={detailId}
        imageBase={imageBase}
        onOpenChange={(open) => { if (!open) setDetailId(null) }}
      />
    </div>
  )
}
