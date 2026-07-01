import type { DB } from '@revelio/db'
import { sets } from '@revelio/db'
import type { DistSet } from './types.js'

export async function loadSets(db: DB, input: DistSet[]): Promise<void> {
  if (input.length === 0) return
  await db
    .insert(sets)
    .values(input.map((s) => ({
      code: s.code,
      name: s.name,
      releaseDate: s.releaseDate,
      isOfficial: s.isOfficial,
      cardCount: s.cardCount,
      symbol: s.symbol,
      origin: 'import',
    })))
    .onConflictDoNothing({ target: sets.code })
}
