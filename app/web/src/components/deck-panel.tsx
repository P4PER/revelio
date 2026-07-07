'use client'
import { useLocale, useTranslations } from 'next-intl'
import { Minus, Plus, Wand2 } from 'lucide-react'
import type { DeckCardView, DeckZone } from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { lessonBgClass } from '@/lib/lesson-colors'
import { cn } from '@/lib/utils'

const LESSON_GROUP = '__lesson__'
const ITEM_GROUP = '__item__'

// Main-zone grouping key: real lesson code when present, else a synthetic
// bucket for lesson cards themselves, else a synthetic bucket for everything
// else (items, quidditch cards, etc. with no lesson tag).
function groupKey(e: DeckCardView): string {
  if (e.isLesson) return LESSON_GROUP
  if (e.lesson) return e.lesson
  return ITEM_GROUP
}

function groupColorClass(key: string): string {
  if (key === LESSON_GROUP) return 'bg-primary'
  if (key === ITEM_GROUP) return 'bg-muted-foreground'
  return lessonBgClass(key)
}

// Takes the deck's full entry list, groups the main zone by lesson (falling
// back to synthetic "Lessons"/"Items" buckets), and renders the character
// slot, main groups (with quantity steppers), and sideboard. Presentational —
// quantity changes are emitted up to the owner of BuilderState.
export function DeckPanel({
  entries,
  onQuantityChange,
}: {
  entries: DeckCardView[]
  onQuantityChange: (cardId: string, zone: DeckZone, qty: number) => void
}) {
  const t = useTranslations('decks')
  const locale = useLocale()

  const character = entries.find((e) => e.zone === 'character')
  const main = entries.filter((e) => e.zone === 'main')
  const sideboard = entries.filter((e) => e.zone === 'sideboard')
  const mainCount = main.reduce((n, e) => n + e.quantity, 0)
  const sideCount = sideboard.reduce((n, e) => n + e.quantity, 0)

  const groups = new Map<string, DeckCardView[]>()
  for (const e of main) {
    const key = groupKey(e)
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  const groupLabel = (key: string) =>
    key === LESSON_GROUP ? t('panel.lessons') : key === ITEM_GROUP ? t('panel.items') : attrLabel('lessons', key, locale)

  function row(e: DeckCardView) {
    return (
      <div key={`${e.zone}-${e.cardId}`} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-muted">
        <span className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background">
          <button
            type="button"
            aria-label={t('panel.decrease', { name: e.name })}
            className="grid h-6 w-5 cursor-pointer place-items-center text-muted-foreground hover:text-primary"
            onClick={() => onQuantityChange(e.cardId, e.zone, e.quantity - 1)}
          >
            <Minus className="size-3" />
          </button>
          <b className="min-w-4 text-center text-xs tabular-nums">{e.quantity}</b>
          <button
            type="button"
            aria-label={t('panel.increase', { name: e.name })}
            className="grid h-6 w-5 cursor-pointer place-items-center text-muted-foreground hover:text-primary"
            onClick={() => onQuantityChange(e.cardId, e.zone, e.quantity + 1)}
          >
            <Plus className="size-3" />
          </button>
        </span>
        {e.cost != null && (
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-[0.62rem] font-bold text-primary-foreground">
            {e.cost}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm">{e.name}</span>
        <span className="text-[0.62rem] tracking-wide text-muted-foreground uppercase">{e.setCode}</span>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto py-1.5">
      <div className="px-4 pt-3 pb-1.5 text-xs tracking-widest text-muted-foreground uppercase">
        {t('panel.character')}
      </div>
      {character ? (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-lg border border-primary/60 bg-gradient-to-r from-primary/10 to-transparent p-2.5">
          <div className="grid size-10 shrink-0 place-items-center rounded-md bg-gradient-to-br from-accent to-secondary">
            <Wand2 className="size-5 text-primary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{character.name}</div>
            <div className="text-xs text-muted-foreground">{character.setCode}</div>
          </div>
          <span className="rounded-full border border-primary/60 px-2 py-0.5 text-[0.62rem] tracking-wide text-primary uppercase">
            {t('panel.characterBadge')}
          </span>
        </div>
      ) : (
        <p className="mx-4 mb-2 text-sm text-muted-foreground">{t('panel.noCharacter')}</p>
      )}

      <div className="flex items-center gap-2 px-4 pt-3 pb-1.5 text-xs tracking-widest text-muted-foreground uppercase">
        <span>{t('panel.main')}</span>
        <span className="ml-auto font-semibold text-foreground tabular-nums">{mainCount} / 60</span>
      </div>
      {main.length === 0 && <p className="mx-4 text-sm text-muted-foreground">{t('panel.emptyMain')}</p>}
      {[...groups.entries()].map(([key, list]) => (
        <div key={key} className="mx-2.5 mb-0.5">
          <div className="flex items-center gap-2 px-1.5 py-1.5 text-sm font-semibold">
            <span className={cn('h-3.5 w-1 rounded-sm', groupColorClass(key))} aria-hidden />
            {groupLabel(key)}
            <span className="ml-auto text-xs font-medium text-muted-foreground">
              {list.reduce((n, e) => n + e.quantity, 0)}
            </span>
          </div>
          {list.map(row)}
        </div>
      ))}

      <div className="flex items-center gap-2 px-4 pt-4 pb-1.5 text-xs tracking-widest text-muted-foreground uppercase">
        <span>{t('panel.sideboard')}</span>
        <span className="ml-auto font-semibold text-foreground tabular-nums">{sideCount} / 15</span>
      </div>
      {sideboard.length === 0 ? (
        <p className="mx-4 text-sm text-muted-foreground">{t('panel.emptySideboard')}</p>
      ) : (
        <div className="mx-2.5 mb-2">{sideboard.map(row)}</div>
      )}
    </div>
  )
}
