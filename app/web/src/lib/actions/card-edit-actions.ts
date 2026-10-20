'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/server/session'
import { getDb } from '@/lib/server/db'
import { saveCardEdit, getCardIndexData } from '@revelio/db'
import { getWriteClient } from '@/lib/server/reindex'
import { reindexCard } from '@revelio/search'
import { routing } from '@/../i18n/routing'
import { CARD_NAME_MAX, type AdventureData, type MatchData } from '@revelio/core'

export type SaveResult = { ok: true; warning?: string } | { ok: false; error: string }

const adventureInput = z.object({ effect: z.string(), reward: z.string(), toSolve: z.string() })
const matchInput = z.object({ prize: z.string(), toWin: z.string() })

const localizationInput = z.object({
  name: z.string().trim().min(1).max(CARD_NAME_MAX),
  text: z.string(),
  flavorText: z.string(),
  status: z.enum(['machine', 'official']),
  adventure: adventureInput.optional(),
  match: matchInput.optional(),
})

const rulingRow = z.object({
  id: z.string().nullable(),
  date: z.string(),
  source: z.string(),
  text: z.string(),
})

const schema = z.object({
  cardId: z.string().min(1),
  lang: z.enum(routing.locales as unknown as [string, ...string[]]),
  localization: localizationInput,
  rulings: z.array(rulingRow),
})

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

// Saves the whole edit page - the localization and the rulings - in one database
// transaction, so a rulings failure cannot leave the new card text written alone.
export async function saveCardEditAction(input: unknown): Promise<SaveResult> {
  await requireRole('editor')
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { cardId, lang, localization: loc, rulings } = parsed.data

  const db = getDb()
  await saveCardEdit(db, {
    localization: {
      cardId,
      lang,
      name: loc.name,
      text: loc.text.trim() || null,
      flavorText: loc.flavorText.trim() || null,
      status: loc.status,
      ...(loc.adventure !== undefined ? { adventure: normAdventure(loc.adventure) } : {}),
      ...(loc.match !== undefined ? { match: normMatch(loc.match) } : {}),
    },
    rulings: rulings.map((r) => ({ id: r.id, date: r.date || null, source: r.source || null, text: r.text })),
  })

  let warning: string | undefined
  try {
    const data = await getCardIndexData(db, cardId)
    // Refresh the card's document in EVERY language index (bulk ingest writes a
    // fallback doc per card into every index), not only its existing languages -
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
