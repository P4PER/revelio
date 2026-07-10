'use client'
import { useTranslations } from 'next-intl'
import { LayoutGrid, List, Eye } from 'lucide-react'
import { LESSONS } from '@revelio/core'
import type { PublicDeckEntry, PublicDeckSort } from '@revelio/db'
import type { DeckFormat } from '@revelio/core'
import { Link, useRouter } from '@/../i18n/navigation'
import { type BrowseState, browseToQuery } from '@/lib/browse-params'
import { DECK_VIEW_COOKIE, type DeckView } from '@/lib/deck-view'
import { LessonIcons } from '@/components/lesson-icons'
import { DeckLikeButton } from '@/components/deck-like-button'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const SORTS: PublicDeckSort[] = ['likes', 'views', 'newest', 'updated']
const FORMATS: DeckFormat[] = ['classic', 'revival']

export function DeckBrowse({
  state, entries, total, pageCount, loggedIn, initialView,
}: {
  state: BrowseState
  entries: PublicDeckEntry[]
  total: number
  pageCount: number
  loggedIn: boolean
  initialView?: DeckView
}) {
  const t = useTranslations('decks')
  const router = useRouter()
  const view = initialView ?? 'gallery' // default Grid for discovery

  function push(next: Partial<BrowseState>) {
    const merged = { ...state, ...next, page: next.page ?? 1 }
    const q = new URLSearchParams(browseToQuery(merged)).toString()
    router.push(`/decks${q ? `?${q}` : ''}`)
  }

  function setView(next: DeckView) {
    document.cookie = `${DECK_VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
    router.refresh()
  }

  function toggleLesson(code: string) {
    const has = state.lessons.includes(code)
    push({ lessons: has ? state.lessons.filter((l) => l !== code) : [...state.lessons, code] })
  }

  const hasFilters = state.q || state.lessons.length || state.format || state.sort !== 'likes'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-primary">{t('browse.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('browse.subtitle')}</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          defaultValue={state.q}
          placeholder={t('browse.searchPlaceholder')}
          className="max-w-xs"
          onKeyDown={(e) => { if (e.key === 'Enter') push({ q: (e.target as HTMLInputElement).value }) }}
        />
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label={t('browse.sort.label')}
          value={state.sort}
          onChange={(e) => push({ sort: e.target.value as PublicDeckSort })}
        >
          {SORTS.map((s) => <option key={s} value={s}>{t(`browse.sort.${s}`)}</option>)}
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          aria-label={t('browse.format.label')}
          value={state.format ?? ''}
          onChange={(e) => push({ format: (e.target.value || null) as DeckFormat | null })}
        >
          <option value="">{t('browse.format.all')}</option>
          {FORMATS.map((f) => <option key={f} value={f}>{t(`browse.format.${f}`)}</option>)}
        </select>
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={() => router.push('/decks')}>{t('browse.clear')}</Button>
        ) : null}
      </div>

      {/* Lesson chips */}
      <div className="flex flex-wrap items-center gap-2" aria-label={t('browse.lessonsLabel')}>
        {LESSONS.map((l) => {
          const active = state.lessons.includes(l.code)
          return (
            <button
              key={l.code}
              type="button"
              onClick={() => toggleLesson(l.code)}
              aria-pressed={active}
              aria-label={l.code}
              className={cn('flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
                active ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')}
            >
              <span className="inline-block size-3 rounded-full" style={{ backgroundColor: l.color }} />
              <img src={`/lessons/${l.code}.svg`} alt="" width={16} height={16} />
            </button>
          )
        })}
      </div>

      {/* Header row: count + view toggle */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t('browse.count', { count: total })}</span>
        <div className="flex gap-1">
          <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('list')} aria-label="List view">
            <List className="size-4" />
          </Button>
          <Button variant={view === 'gallery' ? 'secondary' : 'ghost'} size="icon" onClick={() => setView('gallery')} aria-label="Grid view">
            <LayoutGrid className="size-4" />
          </Button>
        </div>
      </div>

      {/* Entries */}
      {entries.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t('browse.empty')}</p>
      ) : view === 'list' ? (
        <ul className="space-y-2">
          {entries.map((d) => (
            <li key={d.id}>
              <Link href={`/decks/${d.id}`} className="flex items-center gap-4 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
                <LessonIcons codes={d.lessons} size={18} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{d.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {t('browse.by', { author: d.author })} · {t(`browse.format.${d.format}`)} · {t('browse.cards', { count: d.cardCount })}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <DeckLikeButton deckId={d.id} initialLiked={d.likedByViewer} initialCount={d.likeCount} loggedIn={loggedIn} />
                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Eye className="size-4" />{d.viewCount}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((d) => (
            <li key={d.id}>
              <Link href={`/decks/${d.id}`} className="flex h-full flex-col gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-muted/50">
                <div>
                  <div className="truncate font-medium">{d.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{t('browse.by', { author: d.author })}</div>
                </div>
                <LessonIcons codes={d.lessons} size={20} />
                <div className="text-xs text-muted-foreground">{t(`browse.format.${d.format}`)} · {t('browse.cards', { count: d.cardCount })}</div>
                <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3">
                  <DeckLikeButton deckId={d.id} initialLiked={d.likedByViewer} initialCount={d.likeCount} loggedIn={loggedIn} />
                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Eye className="size-4" />{d.viewCount}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button variant="outline" size="sm" disabled={state.page <= 1} onClick={() => push({ page: state.page - 1 })}>{t('browse.prev')}</Button>
          <span className="text-sm text-muted-foreground">{t('browse.pageOf', { page: state.page, total: pageCount })}</span>
          <Button variant="outline" size="sm" disabled={state.page >= pageCount} onClick={() => push({ page: state.page + 1 })}>{t('browse.next')}</Button>
        </div>
      ) : null}
    </div>
  )
}
