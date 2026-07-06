'use server'
import { z } from 'zod'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import { saveSubTypeTranslations } from '@revelio/db'
import { routing } from '@/../i18n/routing'

const schema = z.object({
  rows: z.array(z.object({
    code: z.string().min(1),
    lang: z.enum(routing.locales as unknown as [string, ...string[]]),
    label: z.string(),
  })),
})

export type SubTypeSaveResult = { ok: true } | { ok: false; error: string }

export async function saveSubTypeTranslationsAction(input: unknown): Promise<SubTypeSaveResult> {
  await requireRole('editor')
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  await saveSubTypeTranslations(getDb(), parsed.data.rows)
  // No cache to invalidate: getSubTypeLabelMap reads per request and the card
  // page renders dynamically, so edits are visible on the next render.
  return { ok: true }
}
