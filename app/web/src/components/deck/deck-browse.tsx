'use client'
import { useRef } from 'react'
import { useTranslations } from 'next-intl'
import { LayoutGrid, List } from 'lucide-react'
import type { PublicDeckEntry, PublicDeckSort } from '@revelio/db'
import type { DeckFormat } from '@revelio/core'
import { useRouter } from '@/../i18n/navigation'
import { type BrowseState, browseToQuery } from '@/lib/browse-params'
import { DECK_VIEW_COOKIE, type DeckView } from '@/lib/deck-view'
import { LessonFilter } from '@/components/search/lesson-filter'
import { ClearFiltersButton } from '@/components/search/clear-filters-button'
import { PaginationNav } from '@/components/search/pagination-nav'
import { DeckHeroCard } from '@/components/deck/deck-hero-card'
import { DeckDiscoverRow } from '@/components/deck/deck-discover-row'
import { Button } from '@/components/ui/button'
import { SearchField } from '@/components/search/search-field'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const SORTS: PublicDeckSort[] = ['likes', 'views', 'newest', 'updated']
const FORMATS: DeckFormat[] = ['classic', 'revival']

export function DeckBrowse({
  state, entries, total, pageSize, initialView, imageBase,
}: {
  state: BrowseState
  entries: PublicDeckEntry[]
  total: number
  pageSize: number
  initialView?: DeckView
  imageBase: string
}) {
  const t = useTranslations('decks')
  const router = useRouter()
  const view = initialView ?? 'gallery' // default Grid for discovery

  function push(next: Partial<BrowseState>) {
    const merged = { ...state, ...next, page: next.page ?? 1 }
    const q = new URLSearchParams(browseToQuery(merged)).toString()
    router.push(`/decks${q ? `?${q}` : ''}`)
  }

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function onSearchChange(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => push({ q: value }), 300)
  }

  function setView(next: DeckView) {
    document.cookie = `${DECK_VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }

  function toggleLesson(code: string) {
    const has = state.lessons.includes(code)
    push({ lessons: has ? state.lessons.filter((l) => l !== code) : [...state.lessons, code] })
  }

  // "Clear filters" resets the narrowing filters (lessons + format) but keeps
  // the search text and sort order, matching the search and deck-builder pages.
  const hasFilters = state.lessons.length || state.format

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-heading">{t('explore.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('explore.subtitle')}</p>
      </div>

      {/* Search — owns its own row so it stays the prominent primary control. */}
      <SearchField
        primary
        defaultValue={state.q}
        placeholder={t('explore.searchPlaceholder')}
        className="w-full"
        onChange={(e) => onSearchChange(e.target.value)}
        onClear={() => onSearchChange('')}
      />

      {/* Lesson chips + format / clear — the narrowing filters, grouped below
          the search like the deck builder, so the compact (32px) filter
          controls sit under the 36px search rather than beside it (where
          they'd read as undersized). Sort is not here — it lives in the
          results header below. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-2" aria-label={t('explore.lessonsLabel')}>
          <LessonFilter selected={state.lessons} onToggle={toggleLesson} />
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select
            value={state.format ?? 'all'}
            onValueChange={(v) => push({ format: v === 'all' ? null : (v as DeckFormat) })}
          >
            <SelectTrigger aria-label={t('explore.format.label')} size="sm" className="w-auto min-w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Radix Select disallows an empty-string item value, so "all" is a
                  sentinel mapped back to null (no format filter). */}
              <SelectItem value="all">{t('explore.format.all')}</SelectItem>
              {FORMATS.map((f) => <SelectItem key={f} value={f}>{t(`explore.format.${f}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <ClearFiltersButton active={Boolean(hasFilters)} onClear={() => push({ lessons: [], format: null })} />
        </div>
      </div>

      {/* Header row: count + sort + view toggle. Sort lives here (with the
          results it orders), not in the filter row above. */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t('explore.count', { count: total })}</span>
        <div className="flex items-center gap-2">
          <Select value={state.sort} onValueChange={(v) => push({ sort: v as PublicDeckSort })}>
            <SelectTrigger aria-label={t('explore.sort.label')} size="sm" className="w-auto min-w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => <SelectItem key={s} value={s}>{t(`explore.sort.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-1">
            <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('list')} aria-label="List view">
              <List className="size-4" />
            </Button>
            <Button variant={view === 'gallery' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('gallery')} aria-label="Grid view">
              <LayoutGrid className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t('explore.empty')}</p>
      ) : view === 'list' ? (
        <ul className="space-y-2">
          {entries.map((d) => (
            <li key={d.id}><DeckDiscoverRow deck={d} imageBase={imageBase} /></li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {entries.map((d) => (
            <li key={d.id}><DeckHeroCard deck={d} imageBase={imageBase} /></li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      <PaginationNav
        page={state.page}
        pageSize={pageSize}
        total={total}
        className="pt-4"
        onPrev={() => push({ page: state.page - 1 })}
        onNext={() => push({ page: state.page + 1 })}
      />
    </div>
  )
}
