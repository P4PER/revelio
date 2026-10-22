import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { drizzle } from 'drizzle-orm/postgres-js'
import { withMigratedDb } from './helpers.js'
import { listPublicDecks, schema, suggestDecks } from '@revelio/db'

// The deck search only gets faster if Postgres can answer it from the pg_trgm
// indexes, and that depends on the query's shape, not just on the indexes
// existing: "name ILIKE q OR username ILIKE q" across the join never uses them.
// So the SQL each query function really sends is captured and EXPLAINed, over
// enough analyzed rows that the planner costs the indexes honestly: on empty
// tables it picks any index at all.

type Captured = { query: string; params: unknown[] }

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

// The search first resolves matching authors, so the deck query is the first
// captured one that reads "decks".
async function deckQuery(run: (db: typeof ctx.db) => Promise<unknown>): Promise<Captured> {
  const seen: Captured[] = []
  const db = drizzle(ctx.sql, { schema, logger: { logQuery: (query, params) => { seen.push({ query, params }) } } })
  await run(db)
  const found = seen.find((c) => c.query.includes('from "decks"'))
  if (!found) throw new Error('no deck query captured')
  return found
}

async function plan({ query, params }: Captured, { noSeqScan = false } = {}): Promise<string> {
  return ctx.sql.begin(async (tx) => {
    if (noSeqScan) await tx`set local enable_seqscan = off`
    const rows = await tx.unsafe(`explain ${query}`, params as never[])
    return rows.map((r) => r['QUERY PLAN']).join('\n')
  })
}

beforeAll(async () => {
  ctx = await withMigratedDb()
  // 2000 authors who all match "player", one who matches "wizard", and 20000
  // decks named so that "potions" is a narrow name search.
  await ctx.sql`
    insert into "user" (id, name, email, username, created_at, updated_at)
    select 'u' || g, 'User ' || g, g || '@e.com', 'player_' || md5(g::text), now(), now()
    from generate_series(1, 2000) g`
  await ctx.sql`
    insert into "user" (id, name, email, username, created_at, updated_at)
    values ('w', 'Wizard', 'w@e.com', 'wizard', now(), now())`
  await ctx.sql`
    insert into decks (id, user_id, name, format, visibility)
    select 'd' || g, case when g % 1000 = 0 then 'w' else 'u' || (1 + g % 2000) end,
      case when g % 997 = 0 then 'Potions ' else 'Deck ' end || md5(g::text), 'classic',
      case when g % 3 = 0 then 'private' else 'public' end
    from generate_series(1, 20000) g`
  // VACUUM, not just ANALYZE: rows inserted after a GIN index was built wait in
  // its pending list, which the planner prices as a scan of every entry.
  // Autovacuum merges it in production.
  await ctx.sql`vacuum analyze`
}, 120_000)

afterAll(async () => { await ctx.stop() })

describe('deck search plan', () => {
  it('serves a narrow browse search from the name and author indexes', async () => {
    const text = await plan(await deckQuery((db) => listPublicDecks(db, { search: 'wizard' })))
    expect(text).toContain('decks_name_trgm_idx')
    expect(text).toContain('decks_user_id_idx')
  })

  it('serves a narrow suggest search from the name and author indexes', async () => {
    const text = await plan(await deckQuery((db) => suggestDecks(db, { query: 'wizard', viewerId: null })))
    expect(text).toContain('decks_name_trgm_idx')
    expect(text).toContain('decks_user_id_idx')
  })

  it('lets an @handle use the username index', async () => {
    const query = await deckQuery((db) => suggestDecks(db, { query: '@wizard', viewerId: null }))
    expect(await plan(query, { noSeqScan: true })).toContain('user_username_trgm_idx')
  })

  // Past the author cap the id list would be a slower plan than the join, so
  // the search falls back to it; the result must not change.
  it('falls back to the join for a term most authors match', async () => {
    const query = await deckQuery((db) => listPublicDecks(db, { search: 'player' }))
    expect(query.query).toContain('"user"."username" ilike')
    const { total } = await listPublicDecks(ctx.db, { search: 'player' })
    const [{ n }] = await ctx.sql`select count(*)::int n from decks where visibility = 'public' and user_id <> 'w'`
    expect(total).toBe(n)
  })

  it('finds decks by name and by author in one narrow search', async () => {
    const { total } = await listPublicDecks(ctx.db, { search: 'wizard' })
    const [{ n }] = await ctx.sql`select count(*)::int n from decks where visibility = 'public' and user_id = 'w'`
    expect(total).toBe(n)
    const potions = await listPublicDecks(ctx.db, { search: 'potions' })
    const [{ p }] = await ctx.sql`select count(*)::int p from decks where visibility = 'public' and name ilike '%potions%'`
    expect(potions.total).toBe(p)
  })
})
