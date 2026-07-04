'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import { saveRulings } from '@revelio/db'
import { routing } from '@/../i18n/routing'

const rulingRow = z.object({
  id: z.string().nullable(),
  date: z.string(),
  source: z.string(),
  text: z.string(),
})

const schema = z.object({
  cardId: z.string().min(1),
  lang: z.enum(routing.locales as unknown as [string, ...string[]]),
  rulings: z.array(rulingRow),
})

export type RulingsSaveResult = { ok: true } | { ok: false; error: string }

export async function saveRulingsAction(input: unknown): Promise<RulingsSaveResult> {
  await requireRole('editor')
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { cardId, lang, rulings } = parsed.data

  await saveRulings(
    getDb(),
    cardId,
    lang,
    rulings.map((r) => ({ id: r.id, date: r.date || null, source: r.source || null, text: r.text })),
  )
  revalidatePath(`/card/${cardId}`)
  revalidatePath(`/card/${cardId}/edit`)
  return { ok: true }
}
