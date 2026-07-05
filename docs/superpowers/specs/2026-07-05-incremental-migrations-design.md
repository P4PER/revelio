# Incremental Migrations (Plan 5a) — Design

> First slice of **Plan 5 (Prod/CI)**, chosen "foundation first". Deploy-target-independent. A sibling slice **5b (CI)** follows and will run the drift guard from this slice.

## Context

Every schema change so far used a destructive pattern: `rm -f drizzle/*.sql && rm -rf drizzle/meta && drizzle-kit generate` — regenerating one consolidated `0000` migration. Because the regenerated `0000` differs from the one already recorded in a database's drizzle migrations table, applying it to an existing DB doesn't work, so each change required a **fresh database / full re-seed**. That is fine in dev but a non-starter for production (it would wipe user data: accounts, edits, uploaded images).

drizzle-kit already supports the correct workflow: `drizzle-kit generate` **appends** an incremental migration (a diff against the stored snapshot) and a journal entry. The destructive part was only the manual `rm`. This slice adopts the incremental workflow and adds guards so the destructive pattern can't silently return.

## Verified starting point

- `drizzle-kit generate` (no delete) against the current tree prints **"No schema changes, nothing to migrate"** — so `0000_peaceful_kinsey_walden` + its snapshot exactly match `schema.ts`. It is a valid baseline.
- `drizzle-kit check` prints **"Everything's fine"** — the migration/journal/snapshot are internally consistent.
- Every existing database (dev compose, test DBs via `runMigrations`) is on `0000`.

## Architecture

Adopt drizzle's native incremental migrations. `0000_peaceful_kinsey_walden` is the **frozen baseline**. From now on:

1. Edit `app/db/src/schema.ts`.
2. `npm run generate` (in `app/db`) → drizzle-kit writes the next `NNNN_*.sql` (diff vs. snapshot) + appends to `drizzle/meta/_journal.json` + a new snapshot.
3. Review the generated SQL, then commit it with the schema change.
4. `runMigrations()` (used by tests via `withMigratedDb`, by the ingest job, and by the compose `migrate` service) applies only the **pending** migrations — existing databases get just the new ones, **no re-seed**.

**Never** `rm` the `drizzle/` folder or regenerate `0000`.

## Deliverables

1. **`check` script** — `app/db/package.json` gains `"check": "drizzle-kit check"` (validates journal/snapshot consistency; catches collisions and hand-edits).
2. **Drift-guard script** — `app/db/scripts/verify-migrations.mjs` (+ `"verify": "..."` script): runs `drizzle-kit generate`; if it produces a new/changed file under `drizzle/` (i.e. `schema.ts` has un-generated changes), it prints a clear error naming the fix (`npm run generate` + commit), removes the just-generated spurious file so the tree is left clean, and exits non-zero. On a consistent tree it is a no-op and exits 0. This is the exact guard against "edited the schema, forgot to generate." 5b (CI) runs `npm run check && npm run verify`.
3. **Migration workflow doc** — `docs/MIGRATIONS.md`: the 4-step workflow above, the "never rm" rule, how `check`/`verify` are used, and how migrations are applied in dev/CI/prod (`runMigrations` / compose `migrate` service).
4. **Correct stale guidance** — replace the "regenerate the consolidated migration / fresh DB / re-seed" language in the deferred notes of the 4b specs (auth, rulings) and in `CLAUDE.md`/agent memory if present, pointing to `docs/MIGRATIONS.md`. The Plan-5 migration TODO is thereby resolved.

## Error handling

- `verify-migrations.mjs` must leave the working tree exactly as it found it (remove any migration file it generated for the check) even on failure, so it is safe to run in CI and locally.
- `drizzle-kit generate`/`check` need no live database (they diff schema vs. snapshot), so the guard runs without Postgres.

## Testing

- `npm run check` (app/db) → exits 0 ("Everything's fine").
- `npm run verify` (app/db) on the current consistent tree → exits 0 and leaves `git status drizzle/` clean.
- Negative check (performed once during implementation, not committed): make a throwaway `schema.ts` edit → `npm run verify` exits non-zero and the tree is left clean → revert the edit.
- Existing suites already exercise `runMigrations` on fresh DBs (they keep passing — the migration application path is unchanged).

## Scope

- **IN:** freeze `0000` as baseline; `check` + drift-guard scripts; `docs/MIGRATIONS.md`; correct the stale regenerate/re-seed guidance.
- **OUT:** wiring the guard into CI (that is **5b**); any actual schema change / demo migration (the next real schema change becomes the first incremental one); prod deploy/secrets/S3/email (later Plan 5 slices).
