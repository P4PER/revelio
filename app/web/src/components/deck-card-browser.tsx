'use client'
import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { Info, Search } from 'lucide-react'
import { LESSONS, deckCardMeta, imageUrl, thumbKey } from '@revelio/core'
import type { DeckCardView, DeckFormat, DeckZone, SetDTO } from '@revelio/core'
import type { SearchDocument, SearchResult } from '@revelio/search'
import { searchDeckCards } from '@/lib/deck-actions'
import { attrLabel } from '@/lib/attribute-labels'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { CardDetailSheet } from '@/components/card-detail-sheet'
import { lessonBgClass } from '@/lib/lesson-colors'

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
  const [set, setSet] = useState('')
  const [costMax, setCostMax] = useState('')
  const [result, setResult] = useState<SearchResult>(EMPTY_RESULT)
  const [pending, setPending] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reqId = useRef(0)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const id = ++reqId.current
      setPending(true)
      searchDeckCards(locale, {
        query,
        format,
        lessons,
        set: set || undefined,
        costMax: costMax === '' ? null : Number(costMax),
      })
        .then((r) => {
          if (id === reqId.current) { setResult(r); setPending(false) }
        })
        .catch(() => {
          if (id === reqId.current) setPending(false)
        })
    }, DEBOUNCE_MS)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [query, format, lessons, set, costMax, locale])

  function toggleLesson(code: string) {
    setLessons((ls) => (ls.includes(code) ? ls.filter((c) => c !== code) : [...ls, code]))
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
        <p className="text-xs text-muted-foreground" role="status">
          {t('browse.resultCount', { count: result.total })}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {LESSONS.map((l) => {
            const active = lessons.includes(l.code)
            return (
              <button
                key={l.code}
                type="button"
                aria-pressed={active}
                onClick={() => toggleLesson(l.code)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                  active ? 'border-accent bg-accent/20 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <span className={cn('size-2 rounded-sm', lessonBgClass(l.code))} aria-hidden />
                {attrLabel('lessons', l.code, locale)}
              </button>
            )
          })}
          <Select value={set || 'any'} onValueChange={(v) => setSet(v === 'any' ? '' : v)}>
            <SelectTrigger size="sm" className="w-auto rounded-full text-xs" aria-label={t('browse.anySet')}>
              <SelectValue placeholder={t('browse.anySet')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t('browse.anySet')}</SelectItem>
              {sets.map((s) => (
                <SelectItem key={s.code} value={s.code}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            inputMode="numeric"
            value={costMax}
            onChange={(e) => setCostMax(e.target.value)}
            placeholder={t('browse.costMax')}
            aria-label={t('browse.costMax')}
            className="h-7 w-24 rounded-full text-xs"
          />
        </div>
      </div>

      <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    disabled={banned}
                    aria-label={t('browse.addAria', { name: hit.name })}
                    className="absolute inset-0 grid place-items-center bg-background/55 opacity-0 transition-opacity focus-visible:opacity-100 disabled:cursor-not-allowed group-hover:opacity-100"
                  >
                    {!banned && (
                      <span className="rounded-full bg-gradient-to-b from-primary to-primary/80 px-3 py-1.5 text-xs font-bold text-primary-foreground">
                        {t('browse.add')}
                      </span>
                    )}
                  </button>
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
                size="icon-xs"
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

      <CardDetailSheet
        cardId={detailId}
        imageBase={imageBase}
        onOpenChange={(open) => { if (!open) setDetailId(null) }}
      />
    </div>
  )
}
