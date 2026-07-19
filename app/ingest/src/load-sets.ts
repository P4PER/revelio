import { resolve, join } from 'node:path'
import type { DB } from '@revelio/db'
import { sets } from '@revelio/db'
import type { DistSet } from './types.js'
import { fileVersion } from './image-versions.js'

// Source releaseDate is "MM-YYYY"; store as a real date on the first of the month.
function toReleaseDate(raw: string | null): string | null {
  if (!raw) return null
  const m = /^(\d{2})-(\d{4})$/.exec(raw)
  return m ? `${m[2]}-${m[1]}-01` : null
}

export async function loadSets(db: DB, input: DistSet[], assetsDir: string): Promise<void> {
  if (input.length === 0) return
  const symbolsDir = resolve(assetsDir, 'symbols')
  await db
    .insert(sets)
    .values(input.map((s) => ({
      code: s.code,
      name: s.name,
      releaseDate: toReleaseDate(s.releaseDate),
      isOfficial: s.isOfficial,
      cardCount: s.cardCount,
      symbolVersion: fileVersion(join(symbolsDir, `${s.code}.webp`)),
      origin: 'import',
    })))
    .onConflictDoNothing({ target: sets.code })
}
