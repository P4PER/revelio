'use client'
import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Info, Minus, Plus } from 'lucide-react'
import type { DeckCardView, DeckStatus, DeckZone } from '@revelio/core'
import { attrLabel } from '@/lib/attribute-labels'
import { cn } from '@/lib/utils'
import { MAIN_TARGET } from '@/lib/deck-legality'
import { groupColor, groupLabel, groupMainEntries } from '@/lib/deck-groups'
import { LessonCost } from './lesson-cost'
import { DeckArt } from '@/components/deck-art'
import { DeckLegalityBar } from '@/components/deck-legality-bar'
import { CardDetailSheet } from '@/components/card-detail-sheet'

// Takes the deck's full entry list, groups the main zone by lesson (falling
// back to synthetic "Lessons"/"Items" buckets), and renders the character
// slot, main groups (with quantity steppers), and sideboard. Presentational —
// quantity changes are emitted up to the owner of BuilderState.
export function DeckPanel({
  entries,
  imageBase,
  status,
  highlight,
  onQuantityChange,
  readOnly = false,
}: {
  entries: DeckCardView[]
  imageBase: string
  status?: DeckStatus
  highlight?: { zone: DeckZone; cardId: string; nonce: number } | null
  onQuantityChange?: (cardId: string, zone: DeckZone, qty: number) => void
  readOnly?: boolean
}) {
  const t = useTranslations('decks')
  const locale = useLocale()
  const [detailId, setDetailId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [flashKey, setFlashKey] = useState<string | null>(null)

  // When a card is added upstream, `highlight` arrives with a fresh nonce.
  // Scroll that row into view within the panel and flash it briefly so the
  // user sees where the card landed. The nonce makes re-adding the same card
  // (a new object identity) re-trigger the effect.
  useEffect(() => {
    if (!highlight) return
    const key = `${highlight.zone}-${highlight.cardId}`
    scrollRef.current
      ?.querySelector(`[data-row-key="${key}"]`)
      ?.scrollIntoView({ block: 'nearest' })
    // Flashing the row is a deliberate response to an external add event.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFlashKey(key)
    const timer = setTimeout(() => setFlashKey(null), 1200)
    return () => clearTimeout(timer)
  }, [highlight])

  const character = entries.find((e) => e.zone === 'character')
  const main = entries.filter((e) => e.zone === 'main')
  const sideboard = entries.filter((e) => e.zone === 'sideboard')
  const mainCount = main.reduce((n, e) => n + e.quantity, 0)
  const sideCount = sideboard.reduce((n, e) => n + e.quantity, 0)

  const groups = groupMainEntries(main)

  function row(e: DeckCardView) {
    return (
      <div
        key={`${e.zone}-${e.cardId}`}
        data-row-key={`${e.zone}-${e.cardId}`}
        className={cn(
          'group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted',
          flashKey === `${e.zone}-${e.cardId}` && 'bg-primary/15',
        )}
      >
        {readOnly ? (
          <b className="min-w-8 text-center text-sm tabular-nums text-muted-foreground">{e.quantity}×</b>
        ) : (
          <span className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background">
            <button
              type="button"
              aria-label={t('panel.decrease', { name: e.name })}
              className="grid h-7 w-6 cursor-pointer place-items-center text-muted-foreground hover:text-primary"
              onClick={() => onQuantityChange?.(e.cardId, e.zone, e.quantity - 1)}
            >
              <Minus className="size-3.5" />
            </button>
            <b className="min-w-4 text-center text-sm tabular-nums">{e.quantity}</b>
            <button
              type="button"
              aria-label={t('panel.increase', { name: e.name })}
              className="grid h-7 w-6 cursor-pointer place-items-center text-muted-foreground hover:text-primary"
              onClick={() => onQuantityChange?.(e.cardId, e.zone, e.quantity + 1)}
            >
              <Plus className="size-3.5" />
            </button>
          </span>
        )}
        {e.lesson ? (
          <LessonCost
            lesson={e.lesson}
            cost={e.cost}
            label={attrLabel('lessons', e.lesson, locale)}
            className="size-6 shrink-0"
            numberClassName="text-xs"
          />
        ) : e.cost != null ? (
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-xs font-bold text-primary-foreground">
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
          className="-mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background hover:text-primary focus-visible:opacity-100"
        >
          <Info className="size-5" />
        </button>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className="flex h-full flex-col overflow-y-auto pb-1.5">
      {status && (
        <DeckLegalityBar
          status={status}
          mainCount={mainCount}
          hasCharacter={Boolean(character)}
          className="border-b border-border/60 px-4 py-3"
        />
      )}
      <div className="px-4 pt-3 pb-1.5 text-xs font-semibold tracking-widest text-primary uppercase">
        {t('panel.character')}
      </div>
      {character ? (
        <div
          data-row-key={`character-${character.cardId}`}
          className={cn(
            'mx-4 mb-2 flex items-center gap-3 rounded-lg border bg-gradient-to-r from-primary/10 to-transparent p-3 transition-shadow',
            flashKey === `character-${character.cardId}` ? 'border-primary ring-1 ring-primary' : 'border-primary/60',
          )}
        >
          <DeckArt
            cardId={character.cardId}
            lessons={character.lesson ? [character.lesson] : []}
            imageBase={imageBase}
            alt={character.name}
            className="h-11 w-16 shrink-0 rounded-md"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{character.name}</div>
            <div className="text-xs text-muted-foreground">
              {character.setCode} · #{character.number}
            </div>
          </div>
          <span className="rounded-full border border-primary/60 px-2 py-0.5 text-xs tracking-wide text-primary uppercase">
            {t('panel.characterBadge')}
          </span>
        </div>
      ) : (
        <p className="mx-4 mb-2 text-sm text-muted-foreground">{t('panel.noCharacter')}</p>
      )}

      <div className="flex items-center gap-2 px-4 pt-3 pb-1.5 text-xs font-semibold tracking-widest text-primary uppercase">
        <span>{t('panel.main')}</span>
        <span className="ml-auto font-semibold text-foreground tabular-nums">{mainCount} / {MAIN_TARGET}</span>
      </div>
      {main.length === 0 && <p className="mx-4 text-sm text-muted-foreground">{t('panel.emptyMain')}</p>}
      {[...groups.entries()].map(([key, list]) => (
        <div key={key} className="mx-2 mb-0.5">
          <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-semibold">
            <span className="h-4 w-1 rounded-sm" style={{ backgroundColor: groupColor(key) }} aria-hidden />
            {groupLabel(key, t)}
            <span className="ml-auto text-sm font-medium text-muted-foreground">
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
        <div className="mx-2 mb-2">{sideboard.map(row)}</div>
      )}

      <CardDetailSheet
        cardId={detailId}
        imageBase={imageBase}
        onOpenChange={(open) => { if (!open) setDetailId(null) }}
      />
    </div>
  )
}
