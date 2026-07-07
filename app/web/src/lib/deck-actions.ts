'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { DeckFormat, DeckVisibility, DeckZone } from '@revelio/core'
import type { CardDetailDTO, DeckCardView } from '@revelio/core'
import type { SearchResult } from '@revelio/search'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { createDeck, updateDeck, updateDeckMeta, deleteDeck, getDeck, getCardById, getCardViews, resolveCardsByName } from '@revelio/db'
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
    types: [],
    lessons: d.lessons ?? [],
    official: d.format === 'classic' ? true : null,
    sort: 'relevance',
    page: d.page ?? 1,
    set: d.set,
    rarities: [],
    finishes: [],
    legalities: [],
    costMin: d.costMin ?? null,
    costMax: d.costMax ?? null,
  }
  return runSearch(getSearchClient(), locale, state)
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
export async function resolveImportNames(names: { name: string; setCode: string | null }[]): Promise<Record<string, string | null>> {
  return resolveCardsByName(getDb(), names)
}

export async function duplicateDeckAction(id: string): Promise<DeckActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  const existing = await getDeck(getDb(), id)
  if (!existing) return { ok: false, error: 'invalid' }
  if (existing.userId !== userId) return { ok: false, error: 'forbidden' }
  const { deck } = existing
  const newId = await createDeck(getDb(), userId, {
    name: `${deck.name} (copy)`, format: deck.format, visibility: deck.visibility, cards: deck.cards,
  })
  revalidatePath('/decks')
  return { ok: true, id: newId }
}
