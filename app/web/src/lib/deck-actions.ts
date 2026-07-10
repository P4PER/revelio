'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { DeckFormat, DeckVisibility, DeckZone } from '@revelio/core'
import type { CardDetailDTO, DeckCardView } from '@revelio/core'
import type { SearchResult } from '@revelio/search'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { createDeck, updateDeck, updateDeckMeta, deleteDeck, getDeck, getDeckForViewer, getCardById, getCardViews, resolveCardsByName, toggleLike, recordView } from '@revelio/db'
import { getSearchClient, runSearch } from '@/lib/search-client'
import type { SearchState } from '@/lib/search-params'

export type DeckActionResult = { ok: true; id: string } | { ok: false; error: string }

const writeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  format: DeckFormat,
  visibility: DeckVisibility,
  cards: z.array(z.object({
    cardId: z.string().min(1),
    zone: DeckZone,
    quantity: z.number().int().positive(),
  })),
})

async function requireUserId(): Promise<string | null> {
  const s = await getSession()
  return s?.user?.id ?? null
}

export async function createDeckAction(input: unknown): Promise<DeckActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  const parsed = writeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const id = await createDeck(getDb(), userId, parsed.data)
  revalidatePath('/decks')
  return { ok: true, id }
}

export async function updateDeckAction(id: string, input: unknown): Promise<DeckActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  const parsed = writeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const existing = await getDeck(getDb(), id)
  if (!existing) return { ok: false, error: 'invalid' }
  if (existing.userId !== userId) return { ok: false, error: 'forbidden' }
  await updateDeck(getDb(), id, parsed.data)
  revalidatePath('/decks')
  revalidatePath(`/decks/${id}`)
  return { ok: true, id }
}

const metaSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  visibility: DeckVisibility.optional(),
})

// Lightweight sibling to updateDeckAction: touches only name/visibility, never
// the card list. Used by the /decks list page (rename, visibility toggle),
// which only has a DeckSummary — reusing updateDeckAction there would wipe
// the deck's cards since it always replaces the full card set.
export async function updateDeckMetaAction(id: string, input: unknown): Promise<DeckActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  const parsed = metaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const existing = await getDeck(getDb(), id)
  if (!existing) return { ok: false, error: 'invalid' }
  if (existing.userId !== userId) return { ok: false, error: 'forbidden' }
  await updateDeckMeta(getDb(), id, parsed.data)
  revalidatePath('/decks')
  revalidatePath(`/decks/${id}`)
  return { ok: true, id }
}

export async function deleteDeckAction(id: string): Promise<DeckActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  const existing = await getDeck(getDb(), id)
  if (!existing) return { ok: false, error: 'invalid' }
  if (existing.userId !== userId) return { ok: false, error: 'forbidden' }
  await deleteDeck(getDb(), id)
  revalidatePath('/decks')
  return { ok: true, id }
}

const deckSearchSchema = z.object({
  query: z.string().optional(),
  format: DeckFormat,
  lessons: z.array(z.string()).optional(),
  types: z.array(z.string()).optional(),
  rarities: z.array(z.string()).optional(),
  finishes: z.array(z.string()).optional(),
  legalities: z.array(z.string()).optional(),
  costMin: z.number().nullable().optional(),
  costMax: z.number().nullable().optional(),
  set: z.string().optional(),
  page: z.number().int().positive().optional(),
})

// Card pool for the deck builder's browse pane: Classic restricts to official
// sets, Revival searches everything (banned cards are still returned — the
// browser flags/disables them client-side rather than filtering them out).
export async function searchDeckCards(locale: string, input: unknown): Promise<SearchResult> {
  const d = deckSearchSchema.parse(input)
  const state: SearchState = {
    q: d.query ?? '',
    types: d.types ?? [],
    lessons: d.lessons ?? [],
    official: d.format === 'classic' ? true : null,
    sort: 'relevance',
    page: d.page ?? 1,
    set: d.set,
    rarities: d.rarities ?? [],
    finishes: d.finishes ?? [],
    legalities: d.legalities ?? [],
    costMin: d.costMin ?? null,
    costMax: d.costMax ?? null,
  }
  // The builder browses in a wide grid, so fetch a larger page than the
  // default search results view (24).
  return runSearch(getSearchClient(), locale, state, { hitsPerPage: 30 })
}

// Full card detail for the browser's Info Sheet. Public read data (same as the
// card page) — no auth gate needed.
export async function getCardDetailAction(id: string, locale: string): Promise<CardDetailDTO | null> {
  return getCardById(getDb(), id, locale)
}

// Card view metadata (name/cost/lesson/legality/…) for an arbitrary set of
// card ids. Used by deck import (JSON path) to turn the {cardId,zone,quantity}
// rows from a parsed deck file into full DeckCardViews the builder can render.
// Public read data (same as getCardDetailAction) — no auth gate needed.
export async function getCardViewsAction(ids: string[]): Promise<Record<string, Omit<DeckCardView, 'zone' | 'quantity'>>> {
  return getCardViews(getDb(), ids)
}

// Resolves {name, setCode} pairs to card ids for the text-import path. Ambiguous
// or missing names resolve to null; the import dialog surfaces those back to
// the user rather than silently dropping them.
export async function resolveImportNames(names: { name: string; setCode: string | null; number: string | null }[]): Promise<Record<string, string | null>> {
  return resolveCardsByName(getDb(), names)
}

export async function duplicateDeckAction(id: string): Promise<DeckActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  const existing = await getDeck(getDb(), id)
  if (!existing) return { ok: false, error: 'invalid' }
  // Owners can duplicate their own decks; anyone logged in can duplicate a
  // public deck into their own account (the copy is theirs, private by default).
  if (existing.userId !== userId && existing.deck.visibility !== 'public') {
    return { ok: false, error: 'forbidden' }
  }
  const { deck } = existing
  const newId = await createDeck(getDb(), userId, {
    name: `${deck.name} (copy)`, format: deck.format, visibility: 'private', cards: deck.cards,
  })
  revalidatePath('/decks')
  return { ok: true, id: newId }
}

export type LikeActionResult = { ok: true; liked: boolean; likeCount: number } | { ok: false; error: string }

export async function toggleLikeAction(deckId: string): Promise<LikeActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  // Only likeable if the viewer can see the deck (own or public); this also
  // 404-guards against liking arbitrary/private deck ids.
  const existing = await getDeckForViewer(getDb(), deckId, userId)
  if (!existing) return { ok: false, error: 'invalid' }
  const res = await toggleLike(getDb(), deckId, userId)
  revalidatePath('/decks')
  return { ok: true, ...res }
}

// Best-effort, logged-in-only view record. Fired from the overview page on
// mount; failures are swallowed (a missed view must never break the page).
export async function recordViewAction(deckId: string): Promise<void> {
  const userId = await requireUserId()
  if (!userId) return
  try {
    await recordView(getDb(), deckId, userId)
  } catch {
    // ignore — vanity counter, not worth surfacing
  }
}
