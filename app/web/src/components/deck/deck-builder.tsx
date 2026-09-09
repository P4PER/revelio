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
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const [highlight, setHighlight] = useState<{ zone: DeckZone; cardId: string; nonce: number } | null>(null)
  const isFirstSave = useRef(true)
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

  // A guest's unsaved draft is the only state the notice speaks to. It and the
  // save-on-login prompt are exclusive - that one needs a session - so on the
  // workbench they share a grid row under the command bar.
  const showDraftNotice = !deckId && !loggedIn

  const sheetTitle = state.name.trim() || t('namePlaceholder')
  const sheetSummary = t('sheet.summary', {
    count: deckCount,
    format: t(`format.${state.format}`),
  })

  return (
    // Below md the builder is the screen: no page padding, no card edge, and
    // the full viewport height under the header. The border and radius would
    // cost about 50px of every card row on a 402px phone, and the card shape
    // only means anything once the builder sits inside a page. It clips at
    // every width: the shut sheet is positioned against this box and hangs
    // below it, and without the clip that hanging body paints over the footer.
    //
    // From md up this is the workbench grid and DeckSheet is display:contents,
    // so its children are placed by row and column rather than by DOM order:
    // the bar lands on row one across both columns, whichever of the draft
    // notice and the save-on-login prompt applies on row two across both, and
    // the two panes share row three. Row two collapses to nothing when there
    // is neither, and the sheet's foot is phone-only, so it takes no row at
    // all - everything it holds has a home in the command bar up here.
    //
    // The md height is the viewport less the header and the page's own py-6.
    // It used to be a flat 100dvh-11rem, but that 11rem was the header plus the
    // padding plus the command bar plus the draft notice - all of which sat
    // outside the grid it sized. The bar is inside this box now, so counting it
    // again left 75px of nothing between the builder and the footer.
    //
    // The sheet is positioned against this box rather than the viewport. The
    // browse pane reserves the peek as padding in the page flow, so the two
    // only line up while they are measured the same way - anchored to the
    // viewport, the sheet drifted a pixel from its band for every pixel the
    // page scrolled, and the gap under the last card row grew as you scrolled
    // toward the footer. Sharing this box also means the sheet leaves with the
    // builder on its own, which an IntersectionObserver used to fake.
    //
    // The sheet comes before the browser in the DOM on purpose: on a phone it
    // is the thing on top, so tabbing reaches its handle first and then the
    // browser, and while the sheet is shut its body is inert and skipped
    // entirely. The cost is that on the workbench the deck column is reached
    // before the card browser, which is the smaller of the two wrongs.
    <div
      className={cn(
        'relative flex h-[calc(100dvh-var(--header-h))] flex-col overflow-hidden',
        'md:grid md:h-[calc(100dvh-var(--header-h)-3rem)] md:min-h-[560px] md:grid-cols-[1.15fr_0.85fr]',
        'md:grid-rows-[auto_auto_minmax(0,1fr)] md:rounded-xl md:border md:border-border/60',
        DECK_SHEET_PEEK_CLASS,
      )}
    >
      <DeckSheet
        expanded={sheetOpen}
        onExpandedChange={setSheetOpen}
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
          className="flex min-h-0 flex-1 flex-col overflow-hidden bg-gradient-to-b from-card/40 to-transparent md:col-start-2 md:row-start-3"
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

        {/* The offer to keep a guest draft. On a phone it sits just above the
            Save it is really about; on the workbench that Save is up in the
            command bar, so the offer follows it there onto row two - the same
            row the draft notice uses, which is free whenever this shows. */}
        {showSavePrompt && (
          <div
            data-deck-save-prompt
            className={cn(
              'shrink-0 border-t border-border/60 bg-card/60 px-4 py-3',
              'md:col-span-2 md:row-start-2 md:border-t-0 md:border-b md:bg-card/40 md:py-2',
            )}
          >
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-primary/10 px-3 py-2">
              {/* text-xs is for the phone, where this sits in a 402px band beside
                  two buttons. From md it spans the workbench and reads as fine
                  print next to sm-sized buttons, so it takes their size. */}
              <p className="flex-1 text-xs text-foreground md:text-sm">{t('savePrompt.message')}</p>
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
          </div>
        )}

        {/* On a phone saving lives with the deck, full width, so its label
            cannot squeeze the command bar the way it used to. The workbench
            keeps its Save up in the bar, where it has always been, so nothing
            is left for this band to hold there. */}
        <div
          data-deck-sheet-foot
          className={cn(
            'shrink-0 border-t border-border/60 bg-card/60 px-4 pt-3 md:hidden',
            // The notice below carries the phone's bottom inset when it is
            // there, so the two do not each reserve the home indicator.
            showDraftNotice ? 'pb-2' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]',
          )}
        >
          <DeckSaveButton
            loggedIn={loggedIn}
            saving={saving}
            onSave={handleSave}
            className="w-full md:hidden"
          />
        </div>

        {/* Under Save on a phone, closing out the foot's band - it says what
            that button is for. The workbench keeps Save up in the command bar,
            so there the notice takes its own grid row directly under that bar,
            spanning both columns. That is the whole reason it sits outside the
            foot: the foot is a box in the deck column, and inside it the
            notice ended up beneath the deck list. */}
        {showDraftNotice && (
          <p
            className={cn(
              'shrink-0 bg-card/60 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-xs text-muted-foreground',
              'md:col-span-2 md:row-start-2 md:border-b md:border-border/60 md:bg-card/40 md:pt-1.5 md:pb-1.5',
            )}
          >
            {t('draftNotice')}
          </p>
        )}
      </DeckSheet>

      <div
        data-pane="browse"
        // pb reserves the band the shut sheet peeks over, so the last card row
        // is never trapped underneath it.
        //
        // isolate only while the sheet is open. The tiles carry their own
        // stacking - the info and rotate buttons are z-30, the same as the
        // sheet - and the pane sits after the sheet in the DOM, so on equal
        // z-index they won and painted over an open sheet, taking clicks
        // through its scrim. Isolating makes those the pane's own business.
        //
        // Not while it is shut, though: CardRotate deliberately escapes to a
        // fixed z-50 image over a z-40 dismiss backdrop, and a stacking context
        // would trap both under the peek handle - leaving a rotated card behind
        // an opaque band whose tap toggles the sheet instead of dismissing it.
        // Shut, there is nothing to protect anyway: the pb above keeps the
        // tiles clear of the peek, so nothing of theirs overlaps it.
        className={cn(
          'min-h-0 flex-1 overflow-hidden pb-[var(--deck-sheet-peek)]',
          'md:col-start-1 md:row-start-3 md:border-r md:border-border/60 md:pb-0',
          sheetOpen && 'max-md:isolate',
        )}
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
