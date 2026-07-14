'use client'
import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Info, Minus, Plus, Wand2 } from 'lucide-react'
import type { DeckCardView, DeckZone } from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { lessonColor } from '@/lib/lesson-colors'
import { LessonCost } from './lesson-cost'
import { CardDetailSheet } from '@/components/card-detail-sheet'

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

// CSS color for a main-zone group's marker bar. Real lesson groups get their
// lesson tint from the LESSONS palette; the two synthetic buckets fall back to
// theme tokens.
function groupColor(key: string): string {
  if (key === LESSON_GROUP) return 'var(--primary)'
  if (key === ITEM_GROUP) return 'var(--muted-foreground)'
  return lessonColor(key) ?? 'var(--muted-foreground)'
}

// Takes the deck's full entry list, groups the main zone by lesson (falling
// back to synthetic "Lessons"/"Items" buckets), and renders the character
// slot, main groups (with quantity steppers), and sideboard. Presentational —
// quantity changes are emitted up to the owner of BuilderState.
export function DeckPanel({
  entries,
  imageBase,
  onQuantityChange,
  readOnly = false,
}: {
  entries: DeckCardView[]
  imageBase: string
  onQuantityChange?: (cardId: string, zone: DeckZone, qty: number) => void
  readOnly?: boolean
}) {
  const t = useTranslations('decks')
  const locale = useLocale()
  const [detailId, setDetailId] = useState<string | null>(null)

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
      <div key={`${e.zone}-${e.cardId}`} className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-muted">
        {readOnly ? (
          <b className="min-w-8 text-center text-xs tabular-nums text-muted-foreground">{e.quantity}×</b>
        ) : (
          <span className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background">
            <button
              type="button"
              aria-label={t('panel.decrease', { name: e.name })}
              className="grid h-6 w-5 cursor-pointer place-items-center text-muted-foreground hover:text-primary"
              onClick={() => onQuantityChange?.(e.cardId, e.zone, e.quantity - 1)}
            >
              <Minus className="size-3" />
            </button>
            <b className="min-w-4 text-center text-xs tabular-nums">{e.quantity}</b>
            <button
              type="button"
              aria-label={t('panel.increase', { name: e.name })}
              className="grid h-6 w-5 cursor-pointer place-items-center text-muted-foreground hover:text-primary"
              onClick={() => onQuantityChange?.(e.cardId, e.zone, e.quantity + 1)}
            >
              <Plus className="size-3" />
            </button>
          </span>
        )}
        {e.lesson ? (
          <LessonCost
            lesson={e.lesson}
            cost={e.cost}
            label={attrLabel('lessons', e.lesson, locale)}
            className="size-5 shrink-0"
            numberClassName="text-[0.62rem]"
          />
        ) : e.cost != null ? (
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-[0.62rem] font-bold text-primary-foreground">
            {e.cost}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="truncate text-sm">{e.name}</span>
          <span className="shrink-0 text-xs tracking-wide text-muted-foreground uppercase">
            {e.setCode} · #{e.number}
          </span>
        </div>
        <button
          type="button"
          aria-label={t('browse.infoAria', { name: e.name })}
          onClick={() => setDetailId(e.cardId)}
          className="-mr-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background hover:text-primary focus-visible:opacity-100"
        >
          <Info className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto py-1.5">
      <div className="px-4 pt-3 pb-1.5 text-xs font-semibold tracking-widest text-primary uppercase">
        {t('panel.character')}
      </div>
      {character ? (
        <div className="mx-4 mb-2 flex items-center gap-3 rounded-lg border border-primary/60 bg-gradient-to-r from-primary/10 to-transparent p-2.5">
          <div className="grid size-10 shrink-0 place-items-center rounded-md bg-gradient-to-br from-accent to-secondary">
            <Wand2 className="size-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{character.name}</div>
            <div className="text-xs text-muted-foreground">
              {character.setCode} · #{character.number}
            </div>
          </div>
          <span className="rounded-full border border-primary/60 px-2 py-0.5 text-[0.62rem] tracking-wide text-primary uppercase">
            {t('panel.characterBadge')}
          </span>
        </div>
      ) : (
        <p className="mx-4 mb-2 text-sm text-muted-foreground">{t('panel.noCharacter')}</p>
      )}

      <div className="flex items-center gap-2 px-4 pt-3 pb-1.5 text-xs font-semibold tracking-widest text-primary uppercase">
        <span>{t('panel.main')}</span>
        <span className="ml-auto font-semibold text-foreground tabular-nums">{mainCount} / 60</span>
      </div>
      {main.length === 0 && <p className="mx-4 text-sm text-muted-foreground">{t('panel.emptyMain')}</p>}
      {[...groups.entries()].map(([key, list]) => (
        <div key={key} className="mx-2.5 mb-0.5">
          <div className="flex items-center gap-2 px-1.5 py-1.5 text-sm font-semibold">
            <span className="h-3.5 w-1 rounded-sm" style={{ backgroundColor: groupColor(key) }} aria-hidden />
            {groupLabel(key)}
            <span className="ml-auto text-xs font-medium text-muted-foreground">
              {list.reduce((n, e) => n + e.quantity, 0)}
            </span>
          </div>
          {list.map(row)}
        </div>
      ))}

      <div className="flex items-center gap-2 px-4 pt-4 pb-1.5 text-xs font-semibold tracking-widest text-primary uppercase">
        <span>{t('panel.sideboard')}</span>
        <span className="ml-auto font-semibold text-foreground tabular-nums">{sideCount} / 15</span>
      </div>
      {sideboard.length === 0 ? (
        <p className="mx-4 text-sm text-muted-foreground">{t('panel.emptySideboard')}</p>
      ) : (
        <div className="mx-2.5 mb-2">{sideboard.map(row)}</div>
      )}

      <CardDetailSheet
        cardId={detailId}
        imageBase={imageBase}
        onOpenChange={(open) => { if (!open) setDetailId(null) }}
      />
    </div>
  )
}
