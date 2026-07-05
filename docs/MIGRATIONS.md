# Migrations

Drizzle migrations are **incremental and append-only**. `app/db/drizzle/0000_peaceful_kinsey_walden.sql` is the frozen baseline; every schema change adds the next `NNNN_*.sql`. Existing databases (dev, prod) apply only the pending migrations — **never a full re-seed**.

## Change the schema

1. Edit `app/db/src/schema.ts`.
2. From `app/db`: `npm run generate` — drizzle-kit writes the next `drizzle/NNNN_*.sql`, a snapshot, and appends to `drizzle/meta/_journal.json`.
3. **Review** the generated SQL (make sure it's the change you intended and won't drop data).
4. Commit the schema edit **and** the generated migration together.

**Never** `rm` the `drizzle/` folder or regenerate `0000`. That produces a migration whose hash differs from what databases already recorded, which is why it used to require a fresh DB / re-seed.

## Guards

- `npm run check` (app/db) — drizzle-kit validates the journal/snapshots are internally consistent.
- `npm run verify` (app/db) — fails if `schema.ts` has changes not captured in a migration (i.e. you edited the schema but forgot `npm run generate`). Runs without a database and leaves the tree clean. CI runs both.

## Apply migrations

- **Tests** apply all migrations to a fresh DB via `runMigrations()` (`app/db/src/migrate.ts`).
- **Dev/prod** apply pending migrations with the compose `migrate` service: `docker compose run --rm migrate` (runs `db/src/migrate-cli.ts`). The ingest job runs the same `runMigrations()` before seeding.

> Supersedes the earlier "regenerate the consolidated migration + fresh DB / re-seed" pattern referenced in the Plan 4b design docs.
