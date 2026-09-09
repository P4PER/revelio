# Card Rulings Query Implementation Plan

**Goal:** Stop the Discord bot's `/card` command from loading a whole `CardDetailDTO` to read
two fields, and stop `@revelio/db`'s connection pool from serializing every query in the
process.

**Architecture:** Two independent changes in the shared `@revelio/db` workspace.

1. A focused `getCardRulings(db, cardId)` query that returns `{ defaultLanguage, rulings }`
   in a single round trip (`cards LEFT JOIN card_rulings LEFT JOIN card_ruling_localizations`),
   replacing the `getCardById` call inside `bot/src/data/cards.ts`. `getCardById` itself is
   unchanged - the card detail page needs every field it loads.
2. `createClient` takes an optional pool size and defaults to postgres.js's own default of
   10 instead of `max: 1`. `max: 1` turns every `Promise.all` of queries into a sequential
   run and makes concurrent requests queue behind each other.

**Tech Stack:** TypeScript, Drizzle, postgres.js, Vitest (Testcontainers for the db tests).

**Spec:** none - this is the deferred performance item from the `feat/discord-bot-foundation`
review (PR #91).

## Global Constraints

- All commands run from `app/`. Node and npm are not on the default PATH: use
  `/usr/local/bin/npm` and `/usr/local/bin/node`.
- Run tests per workspace. Never run the bare `npm test` at the workspace root locally:
  `@revelio/ingest`'s `test/main.test.ts` deletes the dev `cards-en` / `cards-de`
  Meilisearch indexes.
- Code comments are ASCII only.
- Conventional Commits. No Claude/Claude Code attribution.
- Branch: `perf/card-rulings-query`, created off `main`.
- No schema change, so no migration.

---

## Measurement (baseline)

Taken against the local compose stack (1098 cards, 324 rulings), card
`poa-17-secret-keeper` (7 rulings), 60 sequential runs / 20 rounds of 8 concurrent calls:

```
baseline: 8 queries per call, 7 rulings returned
baseline sequential (max: 1)     p50 7.1ms   p95  9.3ms
baseline sequential (max: 10)    p50 5.2ms   p95  7.4ms
baseline 8 concurrent (max: 1)   p50 56.1ms  p95 83.4ms
baseline 8 concurrent (max: 10)  p50 9.7ms   p95 38.2ms
```

After both changes, same machine and same data:

```
new: 1 query per call, 7 rulings returned
new sequential (max: 1)          p50 1.0ms   p95  1.3ms
new sequential (max: 10)         p50 1.0ms   p95  1.2ms
new 8 concurrent (max: 1)        p50 7.9ms   p95  9.2ms
new 8 concurrent (max: 10)       p50 2.3ms   p95 16.0ms
```

8 queries to 1, 7.0ms to 1.0ms sequential, and 56.8ms to 2.3ms for 8 concurrent calls.

Both halves of the concern are real: 8 queries for 2 fields, and `max: 1` costs ~5.8x on
8 concurrent calls even with the query count unchanged. The bot is the loudest caller
(one `/card` per user, no request coalescing), but the pool ceiling applies to `web` too -
`getDb()` hands every server component and server action the same single-connection pool.

## Why raising the pool is safe

- `createClient` callers: `web/src/lib/server/db.ts`, `web/src/lib/server/auth.ts`,
  `bot/src/clients.ts`, `ingest/src/main.ts`, `db/src/migrate-cli.ts`. postgres.js opens
  connections lazily, so the one-shot jobs (`ingest`, `migrate-cli`) that never issue
  overlapping queries still use exactly one connection.
- `ingest` has no parallel writes: the only `Promise.all` over the db is the five reads in
  `build-documents.ts`, which get faster, and `upload-images.ts`'s workers are S3-bound.
- Postgres defaults to `max_connections = 100`. Worst case here is web (2 pools: db + auth)
  plus bot (1 pool) = 30 connections.

---

## Task 1: `getCardRulings` in `@revelio/db`

**Files:**
- Modify: `app/core/src/domain.ts` (add `CardRulingsDTO`)
- Modify: `app/db/src/queries.ts`, `app/db/src/index.ts`
- Test: `app/ingest/test/rulings.test.ts`

- [ ] **Step 1: Write the failing tests** - a card with rulings in two languages returns
      them ordered by `seq` with the full text map and the card's `defaultLanguage`; a card
      with no rulings returns an empty list (not `null`); an unknown card returns `null`.
- [ ] **Step 2: Implement** the single-query version and export it.
- [ ] **Step 3: Verify** `npm test -w @revelio/ingest -- test/rulings.test.ts` passes.

`RulingDTO` already lives in `@revelio/core`; the new wrapper type goes beside it. Types
first in the file, per the repo's declaration-order convention.

## Task 2: Point the bot at it

**Files:**
- Modify: `app/bot/src/data/cards.ts`, `app/bot/src/discord/commands/card.ts`
- Test: `app/bot/test/cards.test.ts`

The bot's own `getCardRulings` keeps its job (resolve one text per ruling for the reader's
locale, drop textless rulings) but is renamed `resolveCardRulings` so the canonical name
belongs to the shared query. Its tests stub `@revelio/db`'s `getCardRulings` instead of
`getCardById`; the assertions do not change.

- [ ] **Step 1: Update the tests** to stub the new dependency.
- [ ] **Step 2: Rename and rewire** the bot function and its call site.
- [ ] **Step 3: Verify** `npm test -w @revelio/bot` and `npm run typecheck` pass.

## Task 3: Pool size

**Files:**
- Modify: `app/db/src/client.ts`

- [ ] **Step 1:** `createClient(databaseUrl, options?: { max?: number })`, default 10, with a
      comment saying why the default is not 1. No call site changes.
- [ ] **Step 2: Verify** with the benchmark, then delete the benchmark script.
