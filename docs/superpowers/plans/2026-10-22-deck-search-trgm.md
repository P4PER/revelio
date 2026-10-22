# Deck Search Trigram Index Plan

**Goal:** Make the deck search (`ILIKE '%q%'` on deck name and author handle, shared by the web
browse page and the bot's `/deck` autocomplete) use an index instead of a sequential scan.

**Architecture:** `pg_trgm` GIN indexes on `decks.name` and `user.username`, plus a rewrite of
`deckSearchCondition` in `db/src/queries/deck-browse.ts`. The rewrite is not optional: the
current condition is `decks.name ILIKE q OR user.username ILIKE q`, an `OR` across the two sides
of a join, and Postgres cannot answer that from per-table indexes.

**Branch:** `perf/deck-search-trgm`.

## Probe (Postgres 17, 200k decks, 20k users, query `potions 3f`)

| Query shape | Plan | Time |
| --- | --- | --- |
| A. today, no trigram index | like_count index walk + filter | 106 ms |
| B. today, with trigram indexes | parallel seq scan + hash join | 118 ms |
| C. `name ILIKE q OR user_id = ANY(ARRAY(SELECT id FROM "user" WHERE username ILIKE q))` | InitPlan on `user` trigram, BitmapOr(decks trigram, `decks_user_id_idx`) | 4.6 ms |
| E. same with `user_id IN (SELECT ...)` | hashed SubPlan as a filter, no bitmap | 38 ms |
| D. `@handle`, with indexes | `user` trigram, nested loop on `decks_user_id_idx` | 3.9 ms |

So the indexes alone change nothing (B), and the subquery must be `= ANY(ARRAY(...))`, which
Postgres runs once as an InitPlan, not `IN (...)` (E), which drizzle's `inArray` would emit.
Queries of one or two characters extract no trigrams and still seq-scan, as today. Escaped
`\%` / `\_` keep using the index.

**Execution note (code review):** shape C has no size estimate and no hashing for the array an
InitPlan builds. On a term most authors match, it walked the whole array once per deck: 7.6 s
against 78 ms for today's query on `pl`, and 160-215 ms against about 75 ms on `pla` / `player`.
The shipped design looks up the matching author ids first (`LIMIT 501`) and passes them as a
value list. A list of values is planned like a literal array, which gets an estimate and a hash
(drizzle prepares only named queries, so every search gets a custom plan). Measured on literal
arrays of 5 to 1000 ids: at most 18 ms on every term. Past 500 matching authors, or below three
characters, the search keeps today's join-spanning OR, which is already the best plan there.

## Tasks

1. **Schema + migration.** In `schema.ts` add
   `index('decks_name_trgm_idx').using('gin', t.name.op('gin_trgm_ops'))`; in `auth-schema.ts`
   give `user` a table callback with `user_username_trgm_idx` the same way. `npm run generate`,
   then prepend `CREATE EXTENSION IF NOT EXISTS pg_trgm;` to the generated SQL by hand:
   drizzle-kit does not emit extensions, and `verify` diffs the snapshot, not the SQL, so the
   hand edit stays in sync. Commit schema + migration together, then `npm run check` and
   `npm run verify`.
2. **Rewrite `deckSearchCondition`** (now async, taking `db`): resolve up to 501 matching
   author ids, then `or(ilike(decks.name, q), inArray(decks.userId, ids))`; fall back to the
   join-spanning OR past 500 ids or under three characters (see the execution note above). The
   `@handle` branch already uses the index and stays.
3. **Regression test** in `ingest/test/deck-suggest.test.ts` (or a sibling): capture the SQL of
   `listPublicDecks` and `suggestDecks` through a drizzle logger, `EXPLAIN` it under
   `SET LOCAL enable_seqscan = off`, and assert both trigram index names appear. Mutation check:
   revert task 2 and confirm the test fails. Existing match/escape tests prove behaviour is
   unchanged.
4. **Verify:** `npm test` (ingest at least), `npm run typecheck`, `npm run lint`; apply the
   migration locally with `migrate-cli` from the host and confirm with `\d decks`.

## Deployment

One migration. `pg_trgm` ships with stock Postgres and is a trusted extension since PG13, so the
app's database owner can create it without superuser. Index build on the current deck count is
instant; no ingest run needed.
