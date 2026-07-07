'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { DeckFormat, DeckVisibility, DeckZone } from '@revelio/core'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { createDeck, updateDeck, deleteDeck, getDeck } from '@revelio/db'

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
