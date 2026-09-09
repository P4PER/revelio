import type { MeiliSearch } from 'meilisearch'
import { createMeiliClient } from '@revelio/search'
import { createClient, type DB } from '@revelio/db'
import { createSetNames, type SetNames } from './data/sets'
import type { BotEnv } from './env'

export type Deps = { meili: MeiliSearch; db: DB; sets: SetNames; env: BotEnv }

// MEILI_SEARCH_KEY is the same read-only key the web app uses. The bot never
// writes, so it never sees MEILI_WRITE_KEY or the master key.
export function createDeps(env: BotEnv): { deps: Deps; close(): Promise<void> } {
  const meili = createMeiliClient(env.MEILI_HOST, env.MEILI_SEARCH_KEY)
  const { db, sql } = createClient(env.DATABASE_URL)
  return {
    deps: { meili, db, sets: createSetNames(db), env },
    close: async () => { await sql.end() },
  }
}
