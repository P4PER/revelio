'use client'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRouter } from '@/../i18n/navigation'
import type { DeckCardView, DeckZone, SetDTO } from '@revelio/core'
import { evaluateDeck } from '@revelio/core'
import {
  type BuilderState,
  addCard,
  clampQuantity,
  copyLimitReached,
  loadDraft,
  saveDraft,
  clearDraft,
  setFormat,
  setQuantity,
} from '@/lib/deck-model'
import { createDeckAction, updateDeckAction } from '@/lib/actions/deck-actions'
import { DeckStatsPanel } from '@/components/deck/deck-stats-panel'
import { DeckPanel } from '@/components/deck/deck-panel'
import { DeckCardBrowser } from '@/components/deck/deck-card-browser'
import { DeckCommandBar } from '@/components/deck/deck-command-bar'
import { DeckSheet, DECK_SHEET_PEEK_CLASS } from '@/components/deck/deck-sheet'
import { DeckSaveButton } from '@/components/deck/deck-save-button'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Owns BuilderState for the whole builder. Below md browsing is the whole
// screen and the deck lives in DeckSheet, a bottom sheet that peeks a handle
// and carries the command bar and the save action inside it; from md up the
// sheet is display:contents and the same children lay out as the two-pane
// Workbench (card browser left, curve + deck panel right) with the command bar
// spanning the top. Guests without a deckId get their state persisted to
// localStorage on every change.
export function DeckBuilder({
  initial,
  deckId,
  loggedIn,
  sets,
  imageBase,
}: {
  initial: BuilderState
  deckId: string | null
  loggedIn: boolean
  sets: SetDTO[]
  imageBase: string
}) {
  const t = useTranslations('decks')
  const router = useRouter()
  const [state, setState] = useState<BuilderState>(initial)
  // Whether the deck sheet is open, below md where it is a sheet at all. From
  // md up the sheet is display:contents and this has no meaning.
  const [sheetOpen, setSheetOpen] = useState(false)
  // The sheet is fixed to the viewport, so without this it would go on
  // hovering over the footer once the builder itself had scrolled past -
  // sitting on top of the footer's own controls.
  const [builderOnScreen, setBuilderOnScreen] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const [highlight, setHighlight] = useState<{ zone: DeckZone; cardId: string; nonce: number } | null>(null)
  const isFirstSave = useRef(true)
  const cardRef = useRef<HTMLDivElement>(null)
  const addNonce = useRef(0)

  // Anyone without a deckId (guest or a logged-in user landing on /decks/new)
  // may have a locally-saved draft. Load it after mount (not in the lazy
  // initializer) so the client's first render matches the server HTML and we
  // avoid a hydration mismatch.
  useEffect(() => {
    if (!deckId) {
      const draft = loadDraft()
      // Intentional: mount-only sync from localStorage (an external system) into
      // React state, guarded by the empty dep array so it fires exactly once.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (draft) setState(draft)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A user who just logged in on the "new deck" page may still have a guest
  // draft sitting in localStorage from before they signed in. Offer to save
  // it to their account instead of silently discarding it.
  useEffect(() => {
    if (loggedIn && !deckId) {
      const draft = loadDraft()
      const hasContent = !!draft && (draft.entries.length > 0 || draft.name.trim().length > 0)
      if (hasContent) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShowSavePrompt(true)
        // The prompt lives at the bottom of the sheet, so on a phone it would
        // otherwise ask to save a draft nobody can see. This is the one thing
        // that opens the sheet on the builder's behalf.
        setSheetOpen(true)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isFirstSave.current) {
      isFirstSave.current = false
      return
    }
    if (!deckId && !loggedIn) saveDraft(state)
  }, [state, deckId, loggedIn])

  useEffect(() => {
    const el = cardRef.current
    // jsdom has no IntersectionObserver; leaving the bar mounted is the right
    // fallback anywhere the API is missing.
    if (!el || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => setBuilderOnScreen(entry.isIntersecting))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  function handleQuantityChange(cardId: string, zone: DeckZone, qty: number) {
    setState((s) => {
      const next = clampQuantity(s, cardId, zone, qty)
      return next === null ? s : setQuantity(s, cardId, zone, next)
    })
  }

  function handleAdd(view: Omit<DeckCardView, 'zone' | 'quantity'>, zone: DeckZone) {
    setState((s) => addCard(s, view, zone))
    setHighlight({ zone, cardId: view.cardId, nonce: ++addNonce.current })
  }

  const metaMap = Object.fromEntries(
    state.entries.map((e) => [
      e.cardId,
      { id: e.cardId, isOfficial: e.isOfficial, legality: e.legality, isLesson: e.isLesson, isStartingCharacter: e.isStartingCharacter },
    ]),
  )
  const deckCount = state.entries.reduce((n, e) => n + e.quantity, 0)
  const evaluation = evaluateDeck(
    state.entries.map((e) => ({ cardId: e.cardId, zone: e.zone, quantity: e.quantity })),
    state.format,
    metaMap,
  )

  async function handleSave() {
    setSaving(true)
    try {
      const input = {
        name: state.name.trim() || t('namePlaceholder'),
        format: state.format,
        visibility: state.visibility,
        cards: state.entries.map((e) => ({ cardId: e.cardId, zone: e.zone, quantity: e.quantity })),
      }
      const result = deckId ? await updateDeckAction(deckId, input) : await createDeckAction(input)
      if (!result.ok) {
        toast.error(t('saveError'))
        return
      }
      if (!deckId) clearDraft()
      toast.success(t('saved'))
      router.push(`/decks/${result.id}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDraftToAccount() {
    const draft = loadDraft()
    if (!draft) {
      setShowSavePrompt(false)
      return
    }
    setSavingDraft(true)
    try {
      const input = {
        name: draft.name.trim() || t('namePlaceholder'),
        format: draft.format,
        visibility: draft.visibility,
        cards: draft.entries.map((e) => ({ cardId: e.cardId, zone: e.zone, quantity: e.quantity })),
      }
      const result = await createDeckAction(input)
      if (!result.ok) {
        toast.error(t('saveError'))
        return
      }
      clearDraft()
      setShowSavePrompt(false)
      toast.success(t('saved'))
      router.push(`/decks/${result.id}`)
    } finally {
      setSavingDraft(false)
    }
  }

  const sheetTitle = state.name.trim() || t('namePlaceholder')
  const sheetSummary = t('sheet.summary', {
    count: deckCount,
    format: t(`format.${state.format}`),
  })

  return (
    // Below md the builder is the screen: no page padding, no card edge, and
    // the full viewport height under the header. The border and radius would
    // cost about 50px of every card row on a 402px phone, and the card shape
    // only means anything once the builder sits inside a page. overflow-hidden
    // is md-only so it can never clip the fixed sheet below md.
    //
    // From md up this is the workbench grid and DeckSheet is display:contents,
    // so the bar lands on row one across both columns, the browser takes the
    // left column down both body rows, and the deck column plus its save footer
    // stack in the right one.
    //
    // The md height is the viewport less the header and the page's own py-6.
    // It used to be a flat 100dvh-11rem, but that 11rem was the header plus the
    // padding plus the command bar plus the draft notice - all of which sat
    // outside the grid it sized. The bar is inside this box now, so counting it
    // again left 75px of nothing between the builder and the footer.
    //
    // The sheet comes before the browser in the DOM on purpose: on a phone it
    // is the thing on top, so tabbing reaches its handle first and then the
    // browser, and while the sheet is shut its body is inert and skipped
    // entirely. The cost is that on the workbench the deck column is reached
    // before the card browser, which is the smaller of the two wrongs.
    <div
      ref={cardRef}
      className={cn(
        'flex h-[calc(100dvh-var(--header-h))] flex-col',
        'md:grid md:h-[calc(100dvh-var(--header-h)-3rem)] md:min-h-[560px] md:grid-cols-[1.15fr_0.85fr]',
        'md:grid-rows-[auto_minmax(0,1fr)_auto] md:overflow-hidden md:rounded-xl md:border md:border-border/60',
        DECK_SHEET_PEEK_CLASS,
      )}
    >
      <DeckSheet
        expanded={sheetOpen}
        onExpandedChange={setSheetOpen}
        onScreen={builderOnScreen}
        toggleLabel={t('sheet.toggle', { count: deckCount })}
        title={sheetTitle}
        subtitle={sheetSummary}
        badge={
          /* Keyed to the add nonce so the badge remounts - and replays its
             enter animation - on every add. While the sheet is shut this count
             is the only sign an add landed. */
          <span
            key={highlight?.nonce ?? 0}
            data-testid="deck-sheet-count"
            aria-hidden
            className="min-w-5 shrink-0 rounded-full bg-foreground px-1.5 text-xs font-semibold text-background tabular-nums motion-safe:animate-in motion-safe:zoom-in-50"
          >
            {deckCount}
          </span>
        }
      >
        <DeckCommandBar
          state={state}
          onNameChange={(name) => setState((s) => ({ ...s, name }))}
          onFormatChange={(f) => setState((s) => setFormat(s, f))}
          onImport={setState}
          loggedIn={loggedIn}
          saving={saving}
          onSave={handleSave}
          className="md:col-span-2 md:row-start-1"
        />

        <div
          data-pane="deck"
          className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-card/40 to-transparent md:col-start-2 md:row-start-2"
        >
          <DeckStatsPanel entries={state.entries} />
          <DeckPanel
            entries={state.entries}
            imageBase={imageBase}
            status={evaluation.status}
            highlight={highlight}
            onQuantityChange={handleQuantityChange}
          />
        </div>

        {/* On a phone saving lives with the deck, full width, so its label
            cannot squeeze the command bar the way it used to. The workbench
            keeps its Save up in the bar, where it has always been. */}
        <div className="shrink-0 border-t border-border/60 bg-card/60 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:col-start-2 md:row-start-3 md:pb-3">
          {showSavePrompt && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-primary/10 px-3 py-2">
              <p className="flex-1 text-xs text-foreground">{t('savePrompt.message')}</p>
              <Button type="button" size="sm" disabled={savingDraft} onClick={handleSaveDraftToAccount}>
                {t('savePrompt.accept')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={savingDraft}
                onClick={() => setShowSavePrompt(false)}
              >
                {t('savePrompt.dismiss')}
              </Button>
            </div>
          )}

          <DeckSaveButton
            loggedIn={loggedIn}
            saving={saving}
            onSave={handleSave}
            className="w-full md:hidden"
          />

          {!deckId && !loggedIn && (
            <p className="mt-2 text-xs text-muted-foreground">{t('draftNotice')}</p>
          )}
        </div>
      </DeckSheet>

      <div
        data-pane="browse"
        // pb reserves the band the shut sheet peeks over, so the last card row
        // is never trapped underneath it.
        className="min-h-0 flex-1 overflow-hidden pb-[var(--deck-sheet-peek)] md:col-start-1 md:row-start-2 md:row-span-2 md:border-r md:border-border/60 md:pb-0"
      >
        <DeckCardBrowser
          format={state.format}
          imageBase={imageBase}
          sets={sets}
          copyLimitReached={(cardId, isLesson) => copyLimitReached(state, cardId, isLesson)}
          onAdd={handleAdd}
        />
      </div>
    </div>
  )
}
