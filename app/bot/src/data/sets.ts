import { listSets, type DB } from '@revelio/db'

// A bot process runs for days, so a boot-time snapshot would miss a set added by
// a later ingest run. Short TTL instead: cheap query, bounded staleness.
const DEFAULT_TTL_MS = 15 * 60 * 1000

export type SetNames = { name(setCode: string, locale: string): Promise<string> }

export function createSetNames(db: DB, ttlMs: number = DEFAULT_TTL_MS): SetNames {
  const cache = new Map<string, { at: number; names: Map<string, string> }>()

  async function namesFor(locale: string): Promise<Map<string, string>> {
    const cached = cache.get(locale)
    if (cached && Date.now() - cached.at < ttlMs) return cached.names
    const sets = await listSets(db, locale)
    const names = new Map(sets.map((s) => [s.code, s.name]))
    cache.set(locale, { at: Date.now(), names })
    return names
  }

  return {
    async name(setCode, locale) {
      const names = await namesFor(locale)
      return names.get(setCode) ?? setCode
    },
  }
}
