'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import { upsertLocalization, getCardIndexData } from '@revelio/db'
import { getWriteClient } from '@/lib/reindex'
import { reindexCard } from '@revelio/search'
import { routing } from '@/../i18n/routing'
import type { AdventureData, MatchData } from '@revelio/core'

const adventureInput = z.object({ effect: z.string(), reward: z.string(), toSolve: z.string() })
const matchInput = z.object({ prize: z.string(), toWin: z.string() })

function normAdventure(a: { effect: string; reward: string; toSolve: string }): AdventureData | null {
  const effect = a.effect.trim() || null
  const reward = a.reward.trim() || null
  const toSolve = a.toSolve.trim() || null
  return effect || reward || toSolve ? { effect, reward, toSolve } : null
}
function normMatch(m: { prize: string; toWin: string }): MatchData | null {
  const prize = m.prize.trim() || null
  const toWin = m.toWin.trim() || null
  return prize || toWin ? { prize, toWin } : null
}

const schema = z.object({
  cardId: z.string().min(1),
  lang: z.enum(routing.locales as unknown as [string, ...string[]]),
  name: z.string().trim().min(1),
  text: z.string(),
  flavorText: z.string(),
  status: z.enum(['machine', 'official']),
  adventure: adventureInput.optional(),
  match: matchInput.optional(),
})

export type SaveResult = { ok: true; warning?: string } | { ok: false; error: string }

export async function updateLocalization(input: unknown): Promise<SaveResult> {
  await requireRole('editor')
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { cardId, lang, name, text, flavorText, status, adventure, match } = parsed.data

  const db = getDb()
  await upsertLocalization(db, {
    cardId,
    lang,
    name,
    text: text.trim() || null,
    flavorText: flavorText.trim() || null,
    status,
    ...(adventure !== undefined ? { adventure: normAdventure(adventure) } : {}),
    ...(match !== undefined ? { match: normMatch(match) } : {}),
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
