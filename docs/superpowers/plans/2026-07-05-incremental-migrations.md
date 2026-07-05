# Incremental Migrations (Plan 5a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt drizzle's native incremental migrations (freeze the current `0000` as baseline; future changes append `NNNN` migrations, no re-seed) and add guards + docs so the old destructive "regenerate + re-seed" pattern can't silently return.

**Architecture:** No code/schema change — this is tooling + docs. Add a `check` script (drizzle-kit's built-in consistency check) and a `verify` drift-guard script (runs `drizzle-kit generate`; if it would produce a migration, the schema drifted from the migrations — fail and restore the tree via git). Document the workflow in `docs/MIGRATIONS.md` and mark the old pattern superseded.

**Tech Stack:** drizzle-kit, Node (ESM script), git.

## Global Constraints

- `0000_peaceful_kinsey_walden` is the **frozen baseline** — never `rm`/regenerate it. Verified consistent: `drizzle-kit generate` → "No schema changes"; `drizzle-kit check` → "Everything's fine".
- Forward workflow: edit `app/db/src/schema.ts` → `npm run generate` (in `app/db`) → review the `NNNN_*.sql` → commit. `runMigrations()` / the compose `migrate` service apply only pending migrations — no re-seed.
- The drift guard must leave the working tree **exactly as found** (revert any generated files) even on failure, and must run **without a live database** (`drizzle-kit generate`/`check` diff schema vs. snapshot only).
- Documentation files are **UPPERCASE** (`docs/MIGRATIONS.md`).
- No `CLAUDE.md` exists. The "regenerate/re-seed" wording lives only in historical superpowers specs/plans — leave those as history; add a one-line "superseded" pointer to the forward-looking deferred notes, and make `docs/MIGRATIONS.md` the source of truth.
- Env quirk: root-owned `~/.npm` → prefix any npx/npm with `NPM_CONFIG_CACHE=/private/tmp/claude-502/-Users-timon-wegener-Desktop-revelio-cards/5736844e-b47b-4a0f-87aa-027e73f7d8a9/scratchpad/npm-cache`.
- Conventional Commits.

## File Structure

```
app/db/scripts/verify-migrations.mjs   # drift guard (new)
app/db/package.json                     # + "check" and "verify" scripts
docs/MIGRATIONS.md                      # workflow doc (new)
docs/superpowers/specs/2026-07-03-auth-foundation-design.md   # superseded note
docs/superpowers/specs/2026-07-04-edit-rulings-design.md      # superseded note
docs/superpowers/specs/2026-07-04-edit-card-images-design.md  # superseded note
```

---

### Task 1: `check` + `verify` (drift guard) scripts

**Files:**
- Create: `app/db/scripts/verify-migrations.mjs`
- Modify: `app/db/package.json`

**Interfaces:**
- Produces: `npm run check` (drizzle-kit consistency) and `npm run verify` (drift guard) in `app/db`.

- [ ] **Step 1: Write the drift-guard script**

`app/db/scripts/verify-migrations.mjs`:
```js
// Fails if app/db/src/schema.ts has changes not captured in a migration.
// Runs `drizzle-kit generate`; if it writes/changes anything under drizzle/,
// the schema drifted from the migrations — restore the tree (so this is safe to
// run in CI and locally) and exit non-zero. No database is needed (generate
// diffs schema vs. the stored snapshot).
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const dbDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const run = (cmd) => execSync(cmd, { cwd: dbDir, stdio: 'pipe' }).toString()

execSync('npx drizzle-kit generate', { cwd: dbDir, stdio: 'inherit' })

const dirty = run('git status --porcelain -- drizzle').trim()
if (dirty) {
  // Restore drizzle/ to HEAD: revert modified tracked files, delete new ones.
  run('git checkout -- drizzle')
  run('git clean -f -- drizzle')
  console.error('\n✗ schema.ts has changes not captured in a migration.')
  console.error('  Run `npm run generate` in app/db, review the new migration, and commit it.\n')
  process.exit(1)
}
console.log('✓ migrations are in sync with schema.ts')
```

- [ ] **Step 2: Add the npm scripts**

In `app/db/package.json`, extend `"scripts"` (keep `generate` and `migrate`):
```json
  "scripts": {
    "generate": "drizzle-kit generate",
    "migrate": "tsx src/migrate-cli.ts",
    "check": "drizzle-kit check",
    "verify": "node scripts/verify-migrations.mjs"
  }
```

- [ ] **Step 3: Verify both pass on the consistent tree**

Run (from `app/db`):
```bash
NPM_CONFIG_CACHE=<scratchpad>/npm-cache npm run check
NPM_CONFIG_CACHE=<scratchpad>/npm-cache npm run verify
git status --porcelain -- drizzle
```
Expected: `check` → "Everything's fine"; `verify` → "✓ migrations are in sync with schema.ts" (exit 0); the `git status` line prints **nothing** (tree clean). If either is non-zero or the tree is dirty, the guard is wrong — fix it.

- [ ] **Step 4: Negative check (manual — do NOT commit the edit)**

Prove the guard fires: append a throwaway column to `app/db/src/schema.ts` (e.g. add `note: text('note'),` to the `sets` table), then:
```bash
NPM_CONFIG_CACHE=<scratchpad>/npm-cache npm run verify; echo "exit=$?"
git status --porcelain -- drizzle
```
Expected: prints the "not captured in a migration" error, `exit=1`, and `git status` is **clean** (the guard restored the generated file). Then revert the schema edit:
```bash
git checkout -- src/schema.ts
```
Confirm `npm run verify` is green again.

- [ ] **Step 5: Commit**

```bash
git add app/db/scripts/verify-migrations.mjs app/db/package.json
git commit -m "build(db): add drizzle-kit check + a migration drift guard (verify-migrations)"
```

---

### Task 2: `docs/MIGRATIONS.md` + supersede the old guidance

**Files:**
- Create: `docs/MIGRATIONS.md`
- Modify: `docs/superpowers/specs/2026-07-03-auth-foundation-design.md`, `docs/superpowers/specs/2026-07-04-edit-rulings-design.md`, `docs/superpowers/specs/2026-07-04-edit-card-images-design.md`

**Interfaces:**
- Consumes: the `check`/`verify` scripts from Task 1.

- [ ] **Step 1: Write `docs/MIGRATIONS.md`**

```markdown
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
```

- [ ] **Step 2: Add a supersede note to the deferred migration guidance**

In each of the three specs, find the line(s) describing the "regenerate the consolidated migration / fresh DB / re-seed" pattern (auth spec: the "Deferred / notes" bullet about the regenerated-migration pattern; rulings spec: the "regenerate the consolidated migration → fresh DB / re-seed" line; card-images spec: the "search index rebuild" note is separate — the migration mention is in its regenerate context). Append to that line, verbatim:
```
 (Superseded by Plan 5a — migrations are now incremental; see docs/MIGRATIONS.md.)
```
Use a targeted edit per file so history stays intact; do not rewrite the surrounding text.

- [ ] **Step 3: Commit**

```bash
git add docs/MIGRATIONS.md docs/superpowers/specs/2026-07-03-auth-foundation-design.md docs/superpowers/specs/2026-07-04-edit-rulings-design.md docs/superpowers/specs/2026-07-04-edit-card-images-design.md
git commit -m "docs: MIGRATIONS.md (incremental workflow) + mark the regenerate/re-seed pattern superseded"
```

---

## Self-Review

**Spec coverage:**
- Adopt incremental / freeze `0000` baseline → Global Constraints + Task 2 doc ✓
- `check` script → Task 1 Step 2 ✓
- Drift-guard script (leaves tree clean, no DB) → Task 1 Step 1 + verified Steps 3-4 ✓
- `docs/MIGRATIONS.md` (workflow, never-rm, check/verify, apply paths) → Task 2 Step 1 ✓
- Correct stale guidance (no CLAUDE.md; supersede note on the deferred notes) → Task 2 Step 2 ✓
- Testing (check 0, verify 0 + clean tree, negative fires + restores) → Task 1 Steps 3-4 ✓
- OUT of scope (CI wiring → 5b; any real schema change/demo migration; prod deploy) → not built ✓

**Placeholder scan:** No TBD/TODO. `<scratchpad>` is the real cache path from Global Constraints. The guard script and the doc are complete.

**Type consistency:** `npm run check` / `npm run verify` names are identical in Task 1 (definition), Task 2 (`docs/MIGRATIONS.md` references), and the future 5b CI. The script path `app/db/scripts/verify-migrations.mjs` matches the `"verify"` script.

## Notes for 5b (CI)
CI runs `cd app/db && npm run check && npm run verify` (needs no services) as a fast gate, alongside lint/typecheck/test/build.
```
