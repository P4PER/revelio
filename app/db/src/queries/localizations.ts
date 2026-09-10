import type { DB } from '../client'
import { cardLocalizations } from '../schema'
import type { AdventureData, MatchData } from '@revelio/core'

export async function upsertLocalization(
  db: DB,
  input: {
    cardId: string
    lang: string
    name: string
    text: string | null
    flavorText: string | null
    status: string | null
    adventure?: AdventureData | null
    match?: MatchData | null
  },
): Promise<void> {
  const now = new Date()
  const base = {
    name: input.name,
    text: input.text,
    flavorText: input.flavorText,
    status: input.status,
    origin: 'user' as const,
    updatedAt: now,
  }
  const extra: { adventure?: AdventureData | null; match?: MatchData | null } = {}
  if ('adventure' in input) extra.adventure = input.adventure ?? null
  if ('match' in input) extra.match = input.match ?? null

  await db
    .insert(cardLocalizations)
    .values({ cardId: input.cardId, lang: input.lang, ...base, ...extra })
    .onConflictDoUpdate({
      target: [cardLocalizations.cardId, cardLocalizations.lang],
      set: { ...base, ...extra },
    })
}

export async function setLocalizationImage(
  db: DB,
  cardId: string,
  lang: string,
  imageVersion: number | null,
): Promise<void> {
  const now = new Date()
  await db
    .insert(cardLocalizations)
    .values({ cardId, lang, name: '', imageVersion, origin: 'user', updatedAt: now })
    .onConflictDoUpdate({
      target: [cardLocalizations.cardId, cardLocalizations.lang],
      set: { imageVersion, origin: 'user', updatedAt: now },
    })
}
