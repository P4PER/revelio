'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Info, Minus, Plus } from 'lucide-react'
import {
  attrLabel,
  groupMainEntries,
  type DeckCardView,
  type DeckStatus,
  type DeckZone,
  type Violation,
} from '@revelio/core'
import { cn } from '@/lib/utils'
import { MAIN_TARGET } from '@/lib/deck-legality'
import { groupColor, groupLabel } from '@/lib/deck-groups'
import { cardNames, rowViolations, type RowViolationCode } from '@/lib/deck-violations'
import { LessonCost } from '@/components/card/lesson-cost'
import { DeckArt } from '@/components/deck/deck-art'
import { DeckLegalityBar } from '@/components/deck/deck-legality-bar'
import { CardDetailSheet } from '@/components/card/card-detail-sheet'

type DeckPanelProps = {
  entries: DeckCardView[]
  imageBase: string
  status?: DeckStatus
  violations?: Violation[]
  highlight?: { zone: DeckZone; cardId: string; nonce: number } | null
  onQuantityChange?: (cardId: string, zone: DeckZone, qty: number) => void
  readOnly?: boolean
}

// The zone a jump from the reasons list lands on when a card sits in several:
// the main deck is where a copy-limit fix is usually made. A reason about the
// starting character always goes to the character slot instead.
const JUMP_ORDER: DeckZone[] = ['main', 'sideboard', 'character']

// Editable quantity sitting between the stepper buttons. While the field is
// being typed into, `draft` holds the raw text; committing clears it so the
// row falls back to the deck's own value -- which is also what snaps the
// field back when a request gets capped by the four-copy rule upstream.
function QuantityInput({
  value,
  label,
  onCommit,
}: {
  value: number
  label: string
  onCommit: (qty: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)

  function commit() {
    if (draft !== null && draft !== '') onCommit(Number(draft))
    setDraft(null)
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={label}
      value={draft ?? String(value)}
      onChange={(ev) => setDraft(ev.target.value.replace(/\D/g, '').slice(0, 2))}
      onFocus={(ev) => ev.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault()
          ev.currentTarget.blur()
        }
        if (ev.key === 'Escape') setDraft(null)
      }}
      className="h-7 w-7 cursor-text bg-transparent text-center text-sm font-bold tabular-nums outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring"
    />
  )
}

// Takes the deck's full entry list, groups the main zone by lesson (falling
// back to synthetic "Lessons"/"Items" buckets), and renders the character
// slot, main groups (with quantity steppers), and sideboard. Presentational —
// quantity changes are emitted up to the owner of BuilderState.
export function DeckPanel({
  entries,
  imageBase,
  status,
  violations,
  highlight,
  onQuantityChange,
  readOnly = false,
}: DeckPanelProps) {
  const t = useTranslations('decks')
  const locale = useLocale()
  const [detail, setDetail] = useState<{ id: string; orientation?: string | null } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [flashKey, setFlashKey] = useState<string | null>(null)

  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Scroll a row into view within the panel and flash it briefly. Used for a
  // card added upstream and for a jump from the reasons list; one timer, so a
  // newer flash is never cut short by an older one ending.
  const flashRow = useCallback((key: string) => {
    scrollRef.current?.querySelector(`[data-row-key="${key}"]`)?.scrollIntoView({ block: 'nearest' })
    setFlashKey(key)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlashKey(null), 1200)
  }, [])

  // When a card is added upstream, `highlight` arrives with a fresh nonce. The
  // nonce makes re-adding the same card (a new object identity) re-trigger it.
  useEffect(() => {
    if (!highlight) return
    // Flashing the row is a deliberate response to an external add event.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    flashRow(`${highlight.zone}-${highlight.cardId}`)
  }, [highlight, flashRow])

  useEffect(() => () => clearTimeout(flashTimer.current), [])

  const character = entries.find((e) => e.zone === 'character')
  const main = entries.filter((e) => e.zone === 'main')
  const sideboard = entries.filter((e) => e.zone === 'sideboard')
  const mainCount = main.reduce((n, e) => n + e.quantity, 0)
  const sideCount = sideboard.reduce((n, e) => n + e.quantity, 0)

  const groups = groupMainEntries(main)
  const marks = rowViolations(violations ?? [])

  function jumpTo(cardId: string, code: Violation['code']) {
    const zone =
      code === 'invalid_character'
        ? 'character'
        : JUMP_ORDER.find((z) => entries.some((e) => e.zone === z && e.cardId === cardId))
    if (zone) flashRow(`${zone}-${cardId}`)
  }

  // Codes shown on a row. Whether a card can start is about the character slot
  // alone, and the copy limit never counts that slot; format codes are per
  // card, so they show on every row it sits in, the character slot included.
  function codesFor(e: DeckCardView): RowViolationCode[] {
    const codes = marks.get(e.cardId) ?? []
    return e.zone === 'character'
      ? codes.filter((c) => c !== 'too_many_copies')
      : codes.filter((c) => c !== 'invalid_character')
  }

  function chips(codes: RowViolationCode[]) {
    return codes.map((c) => (
      <span
        key={c}
        className="shrink-0 rounded-full border border-destructive/45 px-1.5 text-[0.65rem] font-semibold whitespace-nowrap text-destructive"
      >
        {t(`violationChip.${c}`)}
      </span>
    ))
  }

  const characterCodes = character ? codesFor(character) : []

  function row(e: DeckCardView) {
    const codes = codesFor(e)
    return (
      <div
        key={`${e.zone}-${e.cardId}`}
        data-row-key={`${e.zone}-${e.cardId}`}
        data-violation={codes.length ? codes.join(' ') : undefined}
        className={cn(
          'group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted',
          codes.length > 0 && 'bg-destructive/10 shadow-[inset_2px_0_0_var(--destructive)] hover:bg-destructive/15',
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
              className="grid h-7 w-6 cursor-pointer place-items-center text-muted-foreground hover:text-primary-ink"
              onClick={() => onQuantityChange?.(e.cardId, e.zone, e.quantity - 1)}
            >
              <Minus className="size-3.5" />
            </button>
            <QuantityInput
              value={e.quantity}
              label={t('panel.quantity', { name: e.name })}
              onCommit={(qty) => onQuantityChange?.(e.cardId, e.zone, qty)}
            />
            <button
              type="button"
              aria-label={t('panel.increase', { name: e.name })}
              className="grid h-7 w-6 cursor-pointer place-items-center text-muted-foreground hover:text-primary-ink"
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
        {chips(codes)}
        <button
          type="button"
          aria-label={t('browse.infoAria', { name: e.name })}
          onClick={() => setDetail({ id: e.cardId, orientation: e.orientation })}
          className="-mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background hover:text-primary-ink focus-visible:opacity-100 touch:opacity-100"
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
          violations={violations}
          names={cardNames(entries)}
          onJump={jumpTo}
          className="border-b border-border/60 px-4 py-3"
        />
      )}
      <div className="px-4 pt-3 pb-1.5 text-xs font-semibold tracking-widest text-heading uppercase">
        {t('panel.character')}
      </div>
      {character ? (
        <div
          data-row-key={`character-${character.cardId}`}
          data-violation={characterCodes.length ? characterCodes.join(' ') : undefined}
          className={cn(
            'mx-4 mb-2 flex items-center gap-3 rounded-lg border bg-gradient-to-r from-primary/10 to-transparent p-3 transition-shadow',
            flashKey === `character-${character.cardId}`
              ? 'border-primary ring-1 ring-primary'
              : characterCodes.length > 0
                ? 'border-destructive'
                : 'border-primary/60',
          )}
        >
          <DeckArt
            cardId={character.cardId}
            version={character.artCropVersion}
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
          {chips(characterCodes)}
          <span className="rounded-full border border-primary/60 px-2 py-0.5 text-xs tracking-wide text-primary-ink uppercase">
            {t('panel.characterBadge')}
          </span>
        </div>
      ) : (
        <p className="mx-4 mb-2 text-sm text-muted-foreground">{t('panel.noCharacter')}</p>
      )}

      <div className="flex items-center gap-2 px-4 pt-3 pb-1.5 text-xs font-semibold tracking-widest text-heading uppercase">
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

      <div className="flex items-center gap-2 px-4 pt-4 pb-1.5 text-xs font-semibold tracking-widest text-heading uppercase">
        <span>{t('panel.sideboard')}</span>
        <span className="ml-auto font-semibold text-foreground tabular-nums">{sideCount} / 15</span>
      </div>
      {sideboard.length === 0 ? (
        <p className="mx-4 text-sm text-muted-foreground">{t('panel.emptySideboard')}</p>
      ) : (
        <div className="mx-2 mb-2">{sideboard.map(row)}</div>
      )}

      <CardDetailSheet
        cardId={detail?.id ?? null}
        orientation={detail?.orientation}
        imageBase={imageBase}
        onOpenChange={(open) => { if (!open) setDetail(null) }}
      />
    </div>
  )
}
