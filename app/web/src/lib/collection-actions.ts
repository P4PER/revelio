'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { CollectionVisibility, isFinishAllowed } from '@revelio/core'
import { getSession } from '@/lib/session'
import { getDb } from '@/lib/db'
import { getCardFinishes, setCardQuantity, setCollectionVisibility } from '@revelio/db'

export type CollectionActionResult = { ok: true } | { ok: false; error: string }

async function requireUserId(): Promise<string | null> {
  const s = await getSession()
  return s?.user?.id ?? null
}

const qtySchema = z.object({
  cardId: z.string().min(1),
  finish: z.string().min(1),
  quantity: z.number().int(),
})

export async function setCardQuantityAction(
  cardId: string, finish: string, quantity: number,
): Promise<CollectionActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  const parsed = qtySchema.safeParse({ cardId, finish, quantity })
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const finishes = await getCardFinishes(getDb(), cardId)
  if (!finishes) return { ok: false, error: 'invalid' }
  if (!isFinishAllowed(finishes, finish)) return { ok: false, error: 'finish' }

  await setCardQuantity(getDb(), userId, cardId, finish, Math.max(0, quantity))
  revalidatePath('/collection')
  revalidatePath(`/card/${cardId}`)
  return { ok: true }
}

export async function setCollectionVisibilityAction(visibility: unknown): Promise<CollectionActionResult> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'auth' }
  const parsed = CollectionVisibility.safeParse(visibility)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  await setCollectionVisibility(getDb(), userId, parsed.data)
  revalidatePath('/collection')
  return { ok: true }
}
