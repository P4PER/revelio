# Bundled Bot and Ingest Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@revelio/bot` and `@revelio/ingest` as single esbuild bundles run by plain `node`, cutting both Docker images from ~915 MB to roughly the size of `node:22-alpine`.

**Architecture:** Both Dockerfiles today run a bare `npm ci` at the workspaces root and `COPY` the whole hoisted `node_modules` into the runtime stage — 754 MB for ~1.5 MB of application code, because npm hoists every dependency of all six workspaces into one tree. Replace the runtime `node_modules` with an esbuild bundle produced in a build stage: the runtime stage then holds only the base image, one `.mjs` per entrypoint, and (for ingest) the `db/drizzle` SQL files. The entrypoint changes from `npx tsx <src>.ts` to `node <bundle>.mjs`, so `tsx`, `typescript` and the rest of the toolchain stop being runtime dependencies.

**Tech Stack:** esbuild 0.25.x (`--bundle --platform=node --target=node22 --format=esm`), Docker multi-stage builds, `node:22-alpine`.

**Spec:** No separate spec — this plan implements the measured findings recorded in **Background** below.

## Background: the measurements this plan is built on

Taken on 2026-09-14 against `main` at `f56510f`:

| Fact | Value |
|---|---|
| `revelio-bot:local` | 916 MB |
| `revelio-ingest:local` | 909 MB |
| `revelio-web:test` (standalone, for contrast) | 203 MB |
| `node:22-alpine` base | 161 MB |
| the single `COPY node_modules` layer | 754 MB (bot) / 747 MB (ingest) |
| all application source layers combined | < 1.5 MB |

Largest entries in the bot's runtime `node_modules`, none of which the bot imports:
`next` 201 MB, `@next` 84 MB, `lucide-react` 44 MB, `@swc` 34 MB, `date-fns` 26 MB,
`typescript` 23 MB, `@img` (sharp) 18 MB, `date-fns-jalali` 16 MB, `playwright-core` 12.5 MB,
`@ts-morph` 12 MB, `vite` 12 MB, `tsx` 11 MB, `prettier` 10 MB. 704 entries total.

Approaches measured and **rejected**:

- `npm ci --omit=dev` (all workspaces): **805 MB**. Barely helps — `next`, `lucide-react`,
  `sharp` and `date-fns` are web's *production* dependencies and are hoisted to the root.
- `npm ci --omit=dev --workspace @revelio/bot --include-workspace-root`: 167 MB, which works for
  the bot, but the same command for ingest is still **551 MB**: `better-auth` declares `next` as a
  `peerOptional`, which pulls `next` (198 MB) and *its* `peerOptional @playwright/test`
  → `playwright-core`. Confirmed with `npm explain next`.
- Adding `--omit=peer` to the above: still **551 MB**. `npm ci` replays the lockfile graph
  verbatim and does not prune recorded optional-peer edges.

Approach measured and **chosen** — esbuild bundles, built from the current tree with zero warnings:

- `bot/src/main.ts` → 4.3 MB single `.mjs`
- `ingest/src/main.ts` → 1.7 MB single `.mjs`

Neither service has a native dependency: `sharp` is web-only (`image-actions.ts`,
`set-actions.ts`, `deck-og.ts`); `drizzle-orm`, `postgres`, `meilisearch` and `@aws-sdk/client-s3`
are pure JS.

## Global Constraints

- Base image stays `node:22-alpine`, matching the existing Dockerfiles and the root
  `engines.node: ">=22"`. esbuild target is `node22`.
- Bundle format is ESM (`--format=esm`). Every workspace is `"type": "module"`.
- **Nothing about how the code runs on the host may change.** `npm run dev -w @revelio/bot`,
  `npm test`, `npm run typecheck` and the host migration command from `CLAUDE.md`
  (`npx tsx db/src/migrate-cli.ts`) all keep working from TypeScript source via `tsx`.
  The bundle is a packaging step for the images only.
- The build context stays `app/` and the Dockerfile paths stay `app/bot/Dockerfile` and
  `app/ingest/Dockerfile` — `.github/workflows/publish.yml` references both and must not need
  editing.
- `app/.dockerignore` contains `**/dist`, so any host-built bundle is correctly kept out of the
  build context. Bundles are produced **inside** the Docker build stage. Do not remove that rule.
- No tool attribution in commits. Conventional Commits, scope is the workspace.
- The ingest image has **two** entrypoints and both must be bundled: `ingest/src/main.ts`
  (the `CMD`) and `db/src/migrate-cli.ts` (the compose `migrate` service's `command`).

---

### Task 1: Make the migrations directory locatable from a bundle

`db/src/migrate.ts` derives the migrations folder from `import.meta.url`:

```ts
const here = dirname(fileURLToPath(import.meta.url))
export const migrationsDir = resolve(here, '../drizzle')
```

From source at `/app/db/src/migrate.ts` that resolves to `/app/db/drizzle` — correct. From a
bundle at `/app/ingest.mjs` it resolves to `/drizzle` — wrong, and the ingest job would fail at
its first step. Make the path overridable by env so the Dockerfile can state it explicitly while
source runs keep the current behaviour.

**Files:**
- Modify: `app/db/src/migrate.ts:6-7`
- Test: `app/ingest/test/migrations-dir.test.ts` (create — `db/` has no test script of its own;
  its queries and migration runner are covered from `ingest/test`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `migrationsDir` continues to be exported as `string`; a new env var
  `MIGRATIONS_DIR` (absolute path, optional) overrides it. Task 5 sets
  `ENV MIGRATIONS_DIR=/app/drizzle` in `app/ingest/Dockerfile`.

- [ ] **Step 1: Write the failing test**

Create `app/ingest/test/migrations-dir.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolveMigrationsDir } from '@revelio/db'

describe('resolveMigrationsDir', () => {
  it('defaults to the drizzle folder next to the db package source', () => {
    const dir = resolveMigrationsDir({})
    expect(dir.endsWith('/db/drizzle')).toBe(true)
    expect(existsSync(dir)).toBe(true)
  })

  it('honours MIGRATIONS_DIR so a bundle can state its own location', () => {
    expect(resolveMigrationsDir({ MIGRATIONS_DIR: '/app/drizzle' })).toBe('/app/drizzle')
  })

  it('ignores an empty MIGRATIONS_DIR, which is how an unset key arrives from an env file', () => {
    const dir = resolveMigrationsDir({ MIGRATIONS_DIR: '' })
    expect(dir.endsWith('/db/drizzle')).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @revelio/ingest -- migrations-dir`
Expected: FAIL — `resolveMigrationsDir` is not exported by `@revelio/db`.

- [ ] **Step 3: Write the implementation**

Replace lines 6-7 of `app/db/src/migrate.ts`:

```ts
const here = dirname(fileURLToPath(import.meta.url))

// Bundled builds break the import.meta.url derivation: from a single-file bundle at
// /app/ingest.mjs, '../drizzle' resolves to /drizzle instead of the package's own folder.
// MIGRATIONS_DIR lets the image state the path it actually copied the SQL to; running from
// source leaves it unset and keeps the relative default.
export function resolveMigrationsDir(env: Record<string, string | undefined> = process.env): string {
  return env.MIGRATIONS_DIR ? env.MIGRATIONS_DIR : resolve(here, '../drizzle')
}

export const migrationsDir = resolveMigrationsDir()
```

`runMigrations` below it is unchanged and keeps using `migrationsDir`.

Then export the new function from the barrel. In `app/db/src/index.ts`, find the line
re-exporting from `./migrate` and add `resolveMigrationsDir` to it (if the barrel re-exports
with `export * from './migrate'`, no edit is needed — verify with
`grep -n "migrate" app/db/src/index.ts` and only add an explicit name if the barrel is
name-by-name).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -w @revelio/ingest -- migrations-dir`
Expected: PASS, 3 tests.

- [ ] **Step 5: Check nothing else regressed**

Run: `npm run typecheck` from `app/`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add app/db/src/migrate.ts app/db/src/index.ts app/ingest/test/migrations-dir.test.ts
git commit -m "feat(db): let MIGRATIONS_DIR override the migrations folder path"
```

---

### Task 2: Remove the CLI side effect from the bot's register module

This is the bug that makes a naive bundle fail. `bot/src/discord/register.ts` ends with a
module-level block:

```ts
const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) { /* register commands, then process.exit(0) */ }
```

`bot/src/main.ts` imports `registerCommands` from that module, so esbuild inlines the whole file
into the bundle. Inside the bundle, `import.meta.url` is the bundle's own URL and `process.argv[1]`
is the bundle's path — **they match**, so `isMain` becomes `true` and the bot runs a standalone
registration and `process.exit(0)`s at import time, before `main()` ever runs. Split the CLI entry
into its own file so the importable module has no top-level side effect.

Note that `ingest/src/main.ts:42` has a similar `isMain` guard, but that file *is* the bundle's
entrypoint, so the guard stays correct under bundling. Leave it alone.

**Files:**
- Modify: `app/bot/src/discord/register.ts` (delete the trailing `isMain` block and the now-unused
  `fileURLToPath` import)
- Create: `app/bot/src/discord/register-cli.ts`
- Modify: `app/bot/package.json` (the `register` script)
- Test: `app/bot/test/register.test.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `registerCommands(env: BotEnv): Promise<number>` keeps its exact current signature and
  stays exported from `app/bot/src/discord/register.ts`. `register-cli.ts` exports nothing; it is
  an entry script only.

- [ ] **Step 1: Write the failing test**

Create `app/bot/test/register.test.ts`. The test reads the module source rather than importing it,
because under vitest `isMain` is already `false` — an import-based test would pass both before and
after the change and would not bite. What must be guaranteed is a *shape* property: the module is
safe to inline into a bundle.

```ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const registerSrc = readFileSync(
  fileURLToPath(new URL('../src/discord/register.ts', import.meta.url)),
  'utf8',
)

describe('register.ts module shape', () => {
  // main.ts imports registerCommands, so esbuild inlines this whole file into the bot bundle.
  // Inside a bundle, import.meta.url and process.argv[1] both point at the bundle, so an
  // argv-based "am I the entry script?" guard fires and exits the process before main() runs.
  it('has no entry-script guard that a bundle would mistake for the entrypoint', () => {
    expect(registerSrc).not.toContain('process.argv')
  })

  it('does not exit the process at module scope', () => {
    expect(registerSrc).not.toContain('process.exit')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -w @revelio/bot -- register`
Expected: FAIL on both assertions — `register.ts` currently contains `process.argv` and
`process.exit`.

- [ ] **Step 3: Create the dedicated CLI entry**

Create `app/bot/src/discord/register-cli.ts`:

```ts
import { parseEnv } from '../env'
import { registerCommands } from './register'

// Standalone command registration, published without starting the gateway:
// `npm run register -w @revelio/bot`. This lives in its own file rather than behind an
// argv guard in register.ts, because main.ts imports that module and esbuild inlines it
// into the bot bundle, where such a guard would fire and exit before main() runs.
const env = parseEnv()
registerCommands(env)
  .then((n) => {
    const scope = env.DISCORD_GUILD_ID ? `guild ${env.DISCORD_GUILD_ID}` : 'globally'
    console.log(`registered ${n} commands ${scope}`)
    process.exit(0)
  })
  .catch((err) => {
    console.error('command registration failed:', err)
    process.exit(1)
  })
```

- [ ] **Step 4: Strip the side effect from register.ts**

In `app/bot/src/discord/register.ts`, delete the `import { fileURLToPath } from 'node:url'` line at
the top, and delete everything from the `// fileURLToPath, not the URL pathname:` comment to the
end of the file. The file must end with the closing brace of `registerCommands`. Its remaining
imports are `REST`/`Routes` from `discord.js` and `parseEnv, type BotEnv` from `../env` — drop
`parseEnv` from that import if it is now unused, keeping `import type { BotEnv } from '../env'`
(`@typescript-eslint/consistent-type-imports` requires the `type` keyword for a pure type import).

- [ ] **Step 5: Point the register script at the new entry**

In `app/bot/package.json`, change the `register` script from

```json
"register": "node --env-file-if-exists=.env.local --import tsx src/discord/register.ts",
```

to

```json
"register": "node --env-file-if-exists=.env.local --import tsx src/discord/register-cli.ts",
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -w @revelio/bot`
Expected: PASS, including the 2 new `register` tests and the existing `commands`/`catalog-parity`
suites (`registerCommands` is unchanged, so nothing that exercises it should move).

- [ ] **Step 7: Typecheck and lint**

Run: `npm run typecheck` and `npm run lint` from `app/`
Expected: both clean. Lint in particular catches an unused `parseEnv` import left in `register.ts`.

- [ ] **Step 8: Commit**

```bash
git add app/bot/src/discord/register.ts app/bot/src/discord/register-cli.ts \
        app/bot/package.json app/bot/test/register.test.ts
git commit -m "refactor(bot): move standalone command registration to its own entry file"
```

---

### Task 3: Add esbuild build scripts to bot and ingest

esbuild is currently only present transitively (via vite/tsx). Depending on a transitive
dependency is a break waiting to happen, so declare it. Add a `build` script per workspace so the
bundle can be produced and inspected outside Docker too.

**Files:**
- Modify: `app/package.json` (root `devDependencies`)
- Modify: `app/bot/package.json` (add `build`)
- Modify: `app/ingest/package.json` (add `build`)
- Modify: `app/package-lock.json` (regenerated)

**Interfaces:**
- Consumes: Task 2's `register.ts` with no side effect (the bot bundle is only correct once that
  landed).
- Produces: three bundle artefacts, which Task 4 and Task 5 copy into their runtime stages:
  - `app/bot/dist/bot.mjs` from `bot/src/main.ts`
  - `app/ingest/dist/ingest.mjs` from `ingest/src/main.ts`
  - `app/ingest/dist/migrate.mjs` from `db/src/migrate-cli.ts`

- [ ] **Step 1: Declare esbuild at the root**

In `app/package.json`, add to `devDependencies` (keep the existing keys, alphabetical order is not
used in this file — append it after `drizzle-kit`):

```json
"esbuild": "^0.25.12"
```

Then run, from `app/`:

```bash
npm install
```

Expected: `package-lock.json` updates; esbuild was already in the tree at 0.25.12 so no new
download of consequence.

- [ ] **Step 2: Add the bot build script**

In `app/bot/package.json`, add to `scripts`:

```json
"build": "esbuild src/main.ts --bundle --platform=node --target=node22 --format=esm --outfile=dist/bot.mjs --log-level=warning"
```

- [ ] **Step 3: Add the ingest build scripts**

In `app/ingest/package.json`, add to `scripts`:

```json
"build": "npm run build:job && npm run build:migrate",
"build:job": "esbuild src/main.ts --bundle --platform=node --target=node22 --format=esm --outfile=dist/ingest.mjs --log-level=warning",
"build:migrate": "esbuild ../db/src/migrate-cli.ts --bundle --platform=node --target=node22 --format=esm --outfile=dist/migrate.mjs --log-level=warning"
```

- [ ] **Step 4: Run both builds and verify they are clean and small**

Run, from `app/`:

```bash
npm run build -w @revelio/bot && npm run build -w @revelio/ingest
ls -lh bot/dist/bot.mjs ingest/dist/ingest.mjs ingest/dist/migrate.mjs
```

Expected: no warnings on stderr; `bot.mjs` roughly 4-5 MB, `ingest.mjs` roughly 1.5-2 MB,
`migrate.mjs` under 1 MB. A `could not be resolved` error here means a dependency is missing from
the workspace manifest — fix the manifest, do not add an `--external`.

- [ ] **Step 5: Verify the bot bundle no longer self-registers**

This is the Task 2 bug, checked against the real artefact:

```bash
node bot/dist/bot.mjs 2>&1 | head -5
```

Expected: `bot failed to start: Error: Invalid bot environment:` followed by the missing-variable
list, and a non-zero exit. The `bot failed to start:` prefix is printed only by `main()`'s catch
handler — seeing it proves `main()` ran, which cannot happen if a module-level guard exited first.
If instead you see a bare stack trace with no `bot failed to start:` line, Task 2 was not applied
correctly.

- [ ] **Step 6: Verify both ingest bundles load**

```bash
node ingest/dist/ingest.mjs 2>&1 | head -3
node ingest/dist/migrate.mjs 2>&1 | head -3
```

Expected: each prints `DATABASE_URL is required` and exits 1. That is the env guard in each
entrypoint, reached only after the whole module graph loaded.

- [ ] **Step 7: Confirm the bundles stay out of the Docker context**

```bash
grep -n 'dist' .dockerignore
```

Expected: `**/dist` is listed. The host-built bundles must not leak into the build context; the
images build their own.

- [ ] **Step 8: Commit**

```bash
git add app/package.json app/package-lock.json app/bot/package.json app/ingest/package.json
git commit -m "build: add esbuild bundle scripts for the bot and ingest entrypoints"
```

---

### Task 4: Rewrite the bot Dockerfile around the bundle

**Files:**
- Modify: `app/bot/Dockerfile` (full rewrite)

**Interfaces:**
- Consumes: `app/bot/package.json`'s `build` script from Task 3.
- Produces: a `revelio-bot` image whose `CMD` is `["node", "bot.mjs"]`, consumed by the compose
  `bot` service and by `.github/workflows/publish.yml`'s `build-bot` job (unchanged: context `app`,
  file `app/bot/Dockerfile`).

- [ ] **Step 1: Replace the Dockerfile**

Replace the entire contents of `app/bot/Dockerfile` with:

```dockerfile
# syntax=docker/dockerfile:1

# --- deps: reproducible install of the workspace (esbuild is a root dev dep) ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY core/package.json ./core/package.json
COPY db/package.json ./db/package.json
COPY search/package.json ./search/package.json
COPY ingest/package.json ./ingest/package.json
COPY web/package.json ./web/package.json
COPY bot/package.json ./bot/package.json
RUN npm ci

# --- build: bundle the gateway into a single file ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY core ./core
COPY db ./db
COPY search ./search
COPY bot ./bot
RUN npm run build -w @revelio/bot

# A bundle inlines every imported module, so a module-level "am I the entry script?"
# guard sees the bundle as itself and can exit before main() runs. The 'bot failed to
# start:' prefix is printed only by main()'s catch handler, so requiring it here fails
# the build if that ever regresses. Empty env, no network: the run dies at env parsing.
RUN env -i node bot/dist/bot.mjs 2>&1 | grep -q 'bot failed to start:'

# --- runtime: the bundle and nothing else ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S bot -u 1001
COPY --from=build --chown=bot:nodejs /app/bot/dist/bot.mjs ./bot.mjs
USER bot
CMD ["node", "bot.mjs"]
```

- [ ] **Step 2: Build the image**

Run, from `app/`:

```bash
docker build -f bot/Dockerfile -t revelio-bot:bundled .
```

Expected: succeeds. The smoke `RUN` in the build stage must pass; if it fails the build stops
there with a non-zero grep.

- [ ] **Step 3: Compare the size against the current image**

```bash
docker images --format '{{.Repository}}:{{.Tag}}\t{{.Size}}' | grep revelio-bot
```

Expected: `revelio-bot:bundled` around 165-175 MB, against `revelio-bot:local` at 916 MB.

- [ ] **Step 4: Confirm the runtime layer carries no node_modules**

```bash
docker run --rm --entrypoint sh revelio-bot:bundled -c 'ls -la /app; ls /app/node_modules 2>&1 | head -1'
```

Expected: `/app` contains only `bot.mjs`; `ls /app/node_modules` reports no such file or directory.

- [ ] **Step 5: Commit**

```bash
git add app/bot/Dockerfile
git commit -m "perf(bot): ship a single esbuild bundle instead of the hoisted node_modules"
```

---

### Task 5: Rewrite the ingest Dockerfile around the bundles

The ingest image serves two commands: the seeding job (`CMD`) and the migration runner used by the
compose `migrate` service. Both get a bundle. The `db/drizzle/*.sql` files are read from disk at
runtime by drizzle's migrator, so they must be copied into the image and pointed at with
`MIGRATIONS_DIR` from Task 1.

**Files:**
- Modify: `app/ingest/Dockerfile` (full rewrite)
- Modify: `app/docker-compose.yml:100` (the `migrate` service's `command`)

**Interfaces:**
- Consumes: `resolveMigrationsDir` / the `MIGRATIONS_DIR` env var from Task 1;
  `app/ingest/package.json`'s `build` script from Task 3.
- Produces: a `revelio-ingest` image with `CMD ["node", "ingest.mjs"]` and a second runnable
  entrypoint at `/app/migrate.mjs`, consumed by the compose `ingest` and `migrate` services and by
  `.github/workflows/publish.yml`'s `build-ingest` job (unchanged: context `app`, file
  `app/ingest/Dockerfile`).

- [ ] **Step 1: Replace the Dockerfile**

Replace the entire contents of `app/ingest/Dockerfile` with:

```dockerfile
# syntax=docker/dockerfile:1

# --- deps: reproducible install of the workspace (esbuild is a root dev dep) ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY core/package.json ./core/package.json
COPY db/package.json ./db/package.json
COPY search/package.json ./search/package.json
COPY ingest/package.json ./ingest/package.json
COPY web/package.json ./web/package.json
RUN npm ci

# --- build: bundle both entrypoints (the seed job and the migration runner) ---
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.base.json ./
COPY core ./core
COPY db ./db
COPY search ./search
COPY ingest ./ingest
RUN npm run build -w @revelio/ingest

# Both bundles must load their whole module graph and reach their env guard.
RUN env -i node ingest/dist/ingest.mjs  2>&1 | grep -q 'DATABASE_URL is required' \
 && env -i node ingest/dist/migrate.mjs 2>&1 | grep -q 'DATABASE_URL is required'

# --- runtime: bundles + the migration SQL; dataset is mounted at run ---
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/ingest/dist/ingest.mjs ./ingest.mjs
COPY --from=build /app/ingest/dist/migrate.mjs ./migrate.mjs
# drizzle's migrator reads these at runtime, so they are data, not code, and cannot be
# bundled. MIGRATIONS_DIR tells db/src/migrate.ts where they landed: the bundle's own
# import.meta.url would resolve '../drizzle' to /drizzle from /app/ingest.mjs.
COPY --from=build /app/db/drizzle ./drizzle
ENV MIGRATIONS_DIR=/app/drizzle

ENV DATA_DIR=/data
ENV I18N_DIR=/i18n
ENV ASSETS_DIR=/assets
CMD ["node", "ingest.mjs"]
```

- [ ] **Step 2: Point the compose migrate service at the bundle**

In `app/docker-compose.yml`, in the `migrate` service, change

```yaml
    command: ["npx", "tsx", "db/src/migrate-cli.ts"]
```

to

```yaml
    command: ["node", "migrate.mjs"]
```

- [ ] **Step 3: Build the image**

Run, from `app/`:

```bash
docker build -f ingest/Dockerfile -t revelio-ingest:bundled .
```

Expected: succeeds, both smoke `RUN`s pass.

- [ ] **Step 4: Compare the size and confirm the SQL is present**

```bash
docker images --format '{{.Repository}}:{{.Tag}}\t{{.Size}}' | grep revelio-ingest
docker run --rm --entrypoint sh revelio-ingest:bundled -c 'ls /app; ls /app/drizzle/*.sql | wc -l'
```

Expected: `revelio-ingest:bundled` around 165-175 MB against 909 MB; `/app` holds `ingest.mjs`,
`migrate.mjs` and `drizzle/`; the SQL count is 15 (matching `ls app/db/drizzle | wc -l`).

- [ ] **Step 5: Prove the migration runner actually applies migrations from the image**

This is the step that catches a wrong `MIGRATIONS_DIR`. A migrator pointed at an empty or missing
folder reports success having done nothing — the exact trap `CLAUDE.md` warns about — so assert on
the database, not on the log line.

```bash
docker compose up -d postgres
docker compose exec -T postgres psql -U revelio -d revelio -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
docker run --rm --network revelio_default \
  -e DATABASE_URL=postgres://revelio:revelio@postgres:5432/revelio \
  revelio-ingest:bundled node migrate.mjs
docker compose exec -T postgres psql -U revelio -d revelio -c '\dt'
```

Expected: the run prints `migrations applied`, and `\dt` then lists the card/auth tables
(`card`, `set`, `deck`, `user`, `account`, ...) rather than `Did not find any relations`.
Confirm the compose network name first with `docker network ls | grep revelio`; it is
`<project>_default` and the project defaults to the directory name `app`, so it may be
`app_default`.

- [ ] **Step 6: Commit**

```bash
git add app/ingest/Dockerfile app/docker-compose.yml
git commit -m "perf(ingest): ship esbuild bundles instead of the hoisted node_modules"
```

---

### Task 6: Verify the bot boots for real, then document the result

The build-stage smoke test proves the module graph loads. This task proves the thing the change is
actually for: the bundled bot connects to Discord, registers its commands and serves an
interaction.

**Files:**
- Modify: `docs/superpowers/plans/2026-09-14-bundle-service-images.md` (tick the boxes)
- No source changes expected. If the boot surfaces a defect, fix it in the workspace it belongs to
  and add the regression test there before re-running.

**Interfaces:**
- Consumes: `revelio-bot:bundled` from Task 4 and `revelio-ingest:bundled` from Task 5.
- Produces: the measured before/after numbers for the PR's `## Verification` section.

- [ ] **Step 1: Bring the local stack up and seed it**

```bash
docker compose up -d postgres meilisearch rustfs
docker compose run --rm --build migrate
docker compose exec -T postgres psql -U revelio -d revelio -c '\dt'
```

Expected: tables present. Note the `--build`: the compose `migrate` service pins
`image: revelio-ingest:local`, and without `--build` compose reuses a stale image and applies
nothing while printing success.

- [ ] **Step 2: Confirm the bot's env file points at the local stack**

```bash
sed 's/=.*/=<set>/' bot/.env.local
```

Expected: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, `DATABASE_URL`, `MEILI_HOST`,
`MEILI_SEARCH_KEY`, `IMAGE_BASE_URL`, `SITE_BASE_URL` all set. `DISCORD_GUILD_ID` being set matters:
registration is then guild-scoped and instant, and it does not touch the globally published command
set.

**Stop here and confirm with the user before Step 3.** Booting with the real token connects the
live bot from this machine and issues a `PUT` that replaces the command set in that guild. It is
reversible (the next boot of the deployed bot re-registers the same set) and guild-scoped, but it
is an outward-facing action and should be explicitly agreed rather than assumed.

- [ ] **Step 3: Boot the bundled bot against the local stack**

```bash
docker run --rm --name revelio-bot-smoke --network <compose-network> \
  --env-file bot/.env.local \
  -e DATABASE_URL=postgres://revelio:revelio@postgres:5432/revelio \
  -e MEILI_HOST=http://meilisearch:7700 \
  revelio-bot:bundled
```

Expected, within a few seconds:

```
registered N commands
logged in as <botname>#<discriminator>
```

Both lines are required. `registered N commands` alone means the gateway login failed;
`logged in as ...` alone means registration threw and was swallowed by the non-fatal handler in
`main()` — read the `command registration failed` line above it.

- [ ] **Step 4: Exercise one command end to end**

In the Discord guild named by `DISCORD_GUILD_ID`, run `/card name:Alohomora` (or any card present
in the seeded data) and confirm an embed comes back with a thumbnail. Then run `/collection` and
confirm the reply is ephemeral.

Expected: both reply correctly. This exercises the Postgres, Meilisearch and image paths through
the bundle — the parts a module-load smoke test cannot reach.

- [ ] **Step 5: Confirm clean shutdown**

Press Ctrl-C (or `docker stop revelio-bot-smoke` from another shell).

Expected: `SIGTERM received, shutting down` (or `SIGINT`), then the container exits 0. The signal
handlers are registered in `main()`, so this also re-confirms `main()` owns the process.

- [ ] **Step 6: Record the numbers**

```bash
docker images --format '{{.Repository}}:{{.Tag}}\t{{.Size}}' | grep -E 'revelio-(bot|ingest)'
```

Write the before/after pairs into the PR body's `## Verification` section along with the results of
`npm test`, `npm run typecheck` and `npm run lint` from `app/`.

- [ ] **Step 7: Full check suite**

Run, from `app/`:

```bash
npm run lint && npm run typecheck && npm test
```

Expected: all clean. Note that `npm test` wipes the dev Meilisearch indexes
(`main.test.ts` and `index-cards.test.ts` delete `cards-en`/`cards-de`), so run it **after** the
Discord smoke test in Step 4, or re-seed afterwards.

- [ ] **Step 8: Commit the ticked plan and open the PR**

```bash
git add docs/superpowers/plans/2026-09-14-bundle-service-images.md
git commit -m "docs(plans): record the bundled-image plan as executed"
git push -u origin perf/bundle-bot-ingest-images
```

PR title: `perf: bundle the bot and ingest images with esbuild`

---

## Out of scope

Noted during the investigation, deliberately not fixed here:

- **`shadcn` is a production dependency in `app/web/package.json`.** It is a scaffolding CLI and
  belongs in `devDependencies`; as a prod dep it drags `typescript`, `@ts-morph` and `prettier`
  into any production install. It does not affect the two images this plan touches (Next's
  standalone output traces only imported modules), so moving it is a separate change with its own
  verification.
- **`ingest/src/main.ts:42` uses `new URL(import.meta.url).pathname`** rather than
  `fileURLToPath`, so a checkout path containing a space would make its `isMain` guard false.
  Pre-existing, unrelated to bundling, and harmless at the container path `/app/ingest.mjs`.
- **The `web` image** is already 203 MB via Next's `output: standalone` and needs nothing.

## Self-review

**Spec coverage.** Every measured blocker in Background has a task: the hoisted `node_modules`
(Tasks 4, 5), the `register.ts` bundling bug (Task 2), the `migrationsDir` path derivation
(Task 1), the second ingest entrypoint used by compose `migrate` (Tasks 3, 5), and the boot
verification the change was requested with (Task 6).

**Placeholder scan.** No TBDs. Two places intentionally require the executor to look something up
rather than trust the plan: the `db/src/index.ts` barrel style in Task 1 Step 3 (the grep is
given), and the compose network name in Task 5 Step 5 (the command to find it is given). Both are
environment facts that would be wrong to hardcode.

**Type consistency.** `resolveMigrationsDir(env?: Record<string, string | undefined>): string` is
defined in Task 1 and referenced by name in Task 5's interfaces. `registerCommands(env: BotEnv):
Promise<number>` is unchanged across Tasks 2 and 3. Artefact paths `bot/dist/bot.mjs`,
`ingest/dist/ingest.mjs`, `ingest/dist/migrate.mjs` are consistent between Task 3's scripts and
Tasks 4/5's `COPY` lines, and the in-image names `bot.mjs`, `ingest.mjs`, `migrate.mjs` are
consistent between the Dockerfiles' `COPY`/`CMD` and the compose `command`.
