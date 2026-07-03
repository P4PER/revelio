'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import { upsertLocalization, getCardIndexData } from '@revelio/db'
import { getWriteClient } from '@/lib/reindex'
import { reindexCard } from '@revelio/search'
import { routing } from '@/../i18n/routing'

const schema = z.object({
  cardId: z.string().min(1),
  lang: z.enum(routing.locales as unknown as [string, ...string[]]),
  name: z.string().trim().min(1),
  text: z.string(),
  flavorText: z.string(),
  status: z.enum(['machine', 'official']),
})

export type SaveResult = { ok: true; warning?: string } | { ok: false; error: string }

export async function updateLocalization(input: unknown): Promise<SaveResult> {
  await requireRole('editor')
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { cardId, lang, name, text, flavorText, status } = parsed.data

  const db = getDb()
  await upsertLocalization(db, {
    cardId,
    lang,
    name,
    text: text.trim() || null,
    flavorText: flavorText.trim() || null,
    status,
  })

  let warning: string | undefined
  try {
    const data = await getCardIndexData(db, cardId)
    // Refresh the card's document in EVERY language index (bulk ingest writes a
    // fallback doc per card into every index), not only its existing languages —
    // otherwise a fallback doc in another language index goes stale after an edit.
    if (data) await reindexCard(getWriteClient(), data, [...routing.locales])
  } catch (err) {
    console.error('reindexCard failed for card', cardId, err)
    warning = 'reindex-failed'
  }

  revalidatePath(`/card/${cardId}`)
  revalidatePath(`/card/${cardId}/edit`)
  return warning ? { ok: true, warning } : { ok: true }
}
