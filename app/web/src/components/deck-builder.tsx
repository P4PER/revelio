'use client'
import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Link, useRouter } from '@/../i18n/navigation'
import type { DeckCardView, DeckFormat, DeckZone, SetDTO } from '@revelio/core'
import { evaluateDeck } from '@revelio/core'
import {
  type BuilderState,
  addCard,
  copyLimitReached,
  loadDraft,
  saveDraft,
  clearDraft,
  setFormat,
  setQuantity,
} from '@/lib/deck-model'
import { createDeckAction, updateDeckAction } from '@/lib/deck-actions'
import { LegalitySeal } from './legality-seal'
import { LessonCurve } from './lesson-curve'
import { DeckPanel } from './deck-panel'
import { DeckCardBrowser } from './deck-card-browser'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const FORMATS: DeckFormat[] = ['classic', 'revival']

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
  const [saving, setSaving] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [showSavePrompt, setShowSavePrompt] = useState(false)
  const isFirstSave = useRef(true)

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

  function handleQuantityChange(cardId: string, zone: DeckZone, qty: number) {
    setState((s) => {
      if (zone !== 'character' && qty > 0) {
        const current = s.entries.find((e) => e.cardId === cardId && e.zone === zone)
        const increasing = qty > (current?.quantity ?? 0)
        if (increasing && copyLimitReached(s, cardId, current?.isLesson ?? false)) return s
      }
      return setQuantity(s, cardId, zone, qty)
    })
  }

  function handleAdd(view: Omit<DeckCardView, 'zone' | 'quantity'>, zone: DeckZone) {
    setState((s) => addCard(s, view, zone))
  }

  const metaMap = Object.fromEntries(
    state.entries.map((e) => [
      e.cardId,
      { id: e.cardId, isOfficial: e.isOfficial, legality: e.legality, isLesson: e.isLesson, isStartingCharacter: e.isStartingCharacter },
    ]),
  )
  const evaluation = evaluateDeck(
    state.entries.map((e) => ({ cardId: e.cardId, zone: e.zone, quantity: e.quantity })),
    state.format,
    metaMap,
  )
  const mainEntries = state.entries.filter((e) => e.zone === 'main')
  const mainCount = mainEntries.reduce((n, e) => n + e.quantity, 0)

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
    <div className="flex flex-col overflow-hidden rounded-xl border border-border/60">
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-card/60 px-4 py-2.5">
        <Input
          value={state.name}
          onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
          placeholder={t('namePlaceholder')}
          aria-label={t('namePlaceholder')}
          className="h-8 w-56 border-none bg-transparent px-1 text-base font-semibold shadow-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex-1" />
        <div role="group" aria-label={t('format.label')} className="inline-flex rounded-full border border-border bg-muted p-0.5">
          {FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={state.format === f}
              onClick={() => setState((s) => setFormat(s, f))}
              className={cn(
                'cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition',
                state.format === f
                  ? 'bg-gradient-to-b from-primary to-primary/80 text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`format.${f}`)}
            </button>
          ))}
        </div>
        <LegalitySeal status={evaluation.status} mainCount={mainCount} violations={evaluation.violations} />
        <Button type="button" variant="ghost" size="sm" disabled title={t('comingSoon')}>
          {t('import')}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled title={t('comingSoon')}>
          {t('export')}
        </Button>
        {loggedIn ? (
          <Button type="button" size="sm" disabled={saving} onClick={handleSave}>
            {t('save')}
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" asChild>
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

      <div className="grid grid-cols-1 md:h-[70vh] md:min-h-[560px] md:grid-cols-[1.15fr_0.85fr]">
        <div className="min-h-0 overflow-hidden border-b border-border/60 md:border-r md:border-b-0">
          <DeckCardBrowser
            format={state.format}
            imageBase={imageBase}
            sets={sets}
            copyLimitReached={(cardId, isLesson) => copyLimitReached(state, cardId, isLesson)}
            onAdd={handleAdd}
          />
        </div>
        <div className="flex min-h-0 flex-col overflow-hidden bg-gradient-to-b from-card/40 to-transparent">
          <div className="border-b border-border/60 px-4 py-3">
            <div className="mb-1 text-xs tracking-widest text-muted-foreground uppercase">{t('curve.title')}</div>
            <LessonCurve entries={mainEntries} />
          </div>
          <DeckPanel entries={state.entries} onQuantityChange={handleQuantityChange} />
        </div>
      </div>
    </div>
  )
}
