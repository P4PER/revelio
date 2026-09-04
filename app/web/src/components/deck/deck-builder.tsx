'use client'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link, useRouter } from '@/../i18n/navigation'
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
import {
  DeckFormatSwitch,
  SEGMENT_SELECTED,
  SEGMENT_UNSELECTED,
} from '@/components/deck/deck-format-switch'
import { DeckExportMenu } from '@/components/deck/deck-export-menu'
import { DeckImportDialog } from '@/components/deck/deck-import-dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const PANE_TAB =
  'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition'
const PANE_TAB_ON = `${SEGMENT_SELECTED} shadow-sm`
const PANE_TAB_OFF = SEGMENT_UNSELECTED

// Owns BuilderState for the whole builder: the command bar (name, format
// toggle, legality seal, save/import/export) plus the two-pane Workbench
// layout (card browser left, curve + deck panel right). Guests without a
// deckId get their state persisted to localStorage on every change.
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
  // Which pane owns the screen below md, where the two do not fit side by
  // side. Ignored from md up, which shows both.
  const [pane, setPane] = useState<'browse' | 'deck'>('browse')
  // The pane switch is fixed to the viewport, so without this it would go on
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (hasContent) setShowSavePrompt(true)
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

  return (
    <>
      {/* Below md the builder is the screen: no page padding, no card edge, and
          the full viewport height under the header. The border and radius would
          cost about 50px of every card row on a 402px phone, and the card shape
          only means anything once the builder sits inside a page. */}
      <div
        ref={cardRef}
        className="flex h-[calc(100dvh-var(--header-h))] flex-col overflow-hidden md:h-auto md:rounded-xl md:border md:border-border/60"
      >
        {/* Below sm a three-column grid: name and save take row one, the format
          switch and the two secondary actions row two. Giving each control its
          own row stacked five rows of chrome above the card grid, and letting a
          single flex row wrap dropped them wherever they happened to land. The
          children are placed explicitly, and that placement goes inert when the
          container turns back into a flex row at sm - which is the original
          one-row bar, unchanged. */}
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-2 border-b border-border/60 bg-card/60 px-4 py-3 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <Input
            value={state.name}
            onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
            placeholder={t('namePlaceholder')}
            aria-label={t('namePlaceholder')}
            className="col-span-2 row-start-1 h-9 w-full max-w-full min-w-0 rounded-md px-3 text-lg font-semibold shadow-none sm:w-[40rem] md:text-lg"
          />
          <div className="hidden flex-1 sm:block" />
          <DeckFormatSwitch
            value={state.format}
            onChange={(f) => setState((s) => setFormat(s, f))}
            // Column one is the 1fr track the name spans on row one; without
            // this the switch would stretch to fill it instead of sitting at its
            // own width.
            className="col-start-1 row-start-2 justify-self-start"
          />
          <div className="col-span-2 col-start-2 row-start-2 flex items-center justify-end gap-2 sm:contents">
            <DeckImportDialog state={state} onImport={setState} />
            <DeckExportMenu state={state} variant="outline" compactLabel />
          </div>
          {loggedIn ? (
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={handleSave}
              className="col-start-3 row-start-1 shrink-0"
            >
              {t('save')}
            </Button>
          ) : (
            <Button type="button" size="sm" variant="outline" asChild className="col-start-3 row-start-1 shrink-0">
              <Link href="/login">{t('loginToSave')}</Link>
            </Button>
          )}
        </div>

        {!deckId && !loggedIn && (
          <p className="border-b border-border/60 bg-card/40 px-4 py-1.5 text-xs text-muted-foreground">
            {t('draftNotice')}
          </p>
        )}

        {showSavePrompt && (
          <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-primary/10 px-4 py-2">
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

        {/* Below md the panes fill the viewport under the header rather than a
            fraction of it: 70dvh left the page barely scrollable, so the 80px
            spacer that used to sit under the builder was never scrolled past -
            it just parked 104px of empty space above the footer. */}
        <div className="grid min-h-0 flex-1 grid-cols-1 md:h-[calc(100dvh-11rem)] md:min-h-[560px] md:flex-none md:grid-cols-[1.15fr_0.85fr]">
          <div
            data-pane="browse"
            className={cn(
              'min-h-0 overflow-hidden border-b border-border/60 md:block md:border-r md:border-b-0',
              pane === 'browse' ? 'block' : 'hidden',
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
          <div
            data-pane="deck"
            className={cn(
              'min-h-0 flex-col overflow-hidden bg-gradient-to-b from-card/40 to-transparent md:flex',
              pane === 'deck' ? 'flex' : 'hidden',
            )}
          >
            <DeckStatsPanel entries={state.entries} />
            <DeckPanel entries={state.entries} imageBase={imageBase} status={evaluation.status} highlight={highlight} onQuantityChange={handleQuantityChange} />
          </div>
        </div>
      </div>

      {/* Below md the panes used to stack, which left the deck a full
          screen-scroll under the browser: you added a card and nothing you
          could see changed. This switch hands each pane the viewport instead.
          Both stay mounted, so the browser's query, filters and page all
          survive a trip to the deck and back; its scroll position does not,
          because display:none drops a scroll container's scrollTop. Same
          segmented shape as the format toggle in the bar above.

          Fixed, not inline: inline it scrolled off the top the moment you
          started browsing, so reaching the deck meant scrolling back up. left-6
          / right-6 match the page container's px-6, lining its edges up with
          the builder card. It has to sit outside the builder's own root, whose
          overflow-hidden would clip it. */}
      <div
        role="group"
        aria-label={t('panes.label')}
        className={cn(
          // bottom clears the iOS home indicator where there is one, and falls
          // back to the same 1rem everywhere else.
          'fixed right-6 bottom-[max(1rem,env(safe-area-inset-bottom))] left-6 z-30 gap-1 rounded-xl border border-border/60 bg-card p-1.5 shadow-lg md:hidden',
          builderOnScreen ? 'flex' : 'hidden',
        )}
      >
        <button
          type="button"
          aria-label={t('panes.browse')}
          aria-pressed={pane === 'browse'}
          onClick={() => setPane('browse')}
          className={cn(PANE_TAB, pane === 'browse' ? PANE_TAB_ON : PANE_TAB_OFF)}
        >
          {t('panes.browseShort')}
        </button>
        <button
          type="button"
          aria-label={t('panes.deckAria', { count: deckCount })}
          aria-pressed={pane === 'deck'}
          onClick={() => setPane('deck')}
          className={cn(PANE_TAB, pane === 'deck' ? PANE_TAB_ON : PANE_TAB_OFF)}
        >
          {t('panes.deck')}
          {/* Keyed to the add nonce so the badge remounts - and replays its
              enter animation - on every add. While you are on the browse pane
              this count is the only sign an add landed. */}
          <span
            key={highlight?.nonce ?? 0}
            data-testid="deck-pane-count"
            aria-hidden
            className="min-w-5 rounded-full bg-foreground px-1.5 text-xs font-semibold text-background tabular-nums motion-safe:animate-in motion-safe:zoom-in-50"
          >
            {deckCount}
          </span>
        </button>
      </div>
    </>
  )
}
