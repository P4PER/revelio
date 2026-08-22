# Lib Server Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `app/web/src/lib`'s naming convention for server-side modules into a directory rule the build and the test suite enforce, by extracting `lib/server/` (15 server-runtime modules, each guarded by `import 'server-only'`) and `lib/actions/` (13 Server Action modules) out of the 62-file flat folder.

**Architecture:** Three mechanical commits. First, a guard test asserts every module on a named server list starts with `import 'server-only'` - it fails on `auth.ts` and `deck-og.ts`, which is the real defect this phase exists to close. Then the 15 guarded modules move to `lib/server/` and the guard is retargeted to read that directory, so a future module dropped in without the import fails the suite. Then the 13 `'use server'` modules move to `lib/actions/`. Pure helpers, `utils.ts` included, stay at `lib/` root - `components.json` pins `aliases.utils` to `@/lib/utils`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript path alias `@/* -> ./src/*`, vitest (jsdom, `server-only` aliased to `test/empty.ts`), Drizzle, Better Auth.

**Spec:** `docs/superpowers/specs/2026-08-21-web-source-layout-design.md`

## Global Constraints

- **All commands run from `app/`.** There is no root-level `package.json`.
- **Toolchain is not on PATH:** prefix node/npm with `/usr/local/bin`, gh/gpg with `/opt/homebrew/bin`.
- **Commit signing:** use `git -c gpg.program=/opt/homebrew/bin/gpg commit`.
- **No Claude/Claude Code attribution** in commit messages or PR bodies.
- **Conventional Commits.**
- **Code comments are ASCII only** - no em-dashes, no unicode arrows.
- **Branch:** `refactor/lib-server-boundary`, already created off `main`. Never commit to `main`.
- **Zero behaviour change.** Every step is a file move plus an import rewrite. No signature, no query, no rendered output changes. If a task tempts you to fix an unrelated defect you spot in a moved file, do not - note it and move on.
- **Move files with `git mv`,** never `rm` + `cat`, so git records renames and review stays readable.
- **Do not create barrel files.** No `lib/server/index.ts`, no `lib/actions/index.ts`.
- **Do not move** `utils.ts`, `email/`, `schemas/`, `fonts/`, or any pure helper listed under "stays at `lib/` root" below.
- **Web test files are not typechecked** (`npm run typecheck` skips them via `tsconfig.typecheck.json`). A green typecheck says nothing about `__tests__`; only the vitest run covers them.
- **`expect(...).rejects.toThrow()` is broken in `app/web`** - the matcher always errors. Catch the throw by hand if you need one.

## File Structure

**Moves to `lib/server/` (15).** Every one of these must start with `import 'server-only'` when the phase ends:

| module | already has `server-only`? | why it is server-only |
|---|---|---|
| `account-codes.ts` | yes | DB reads |
| `auth.ts` | **no - add it** | Better Auth config; builds a Drizzle client, reads `BETTER_AUTH_SECRET`, wires the mailer |
| `collection-page-data.ts` | yes | DB reads |
| `db.ts` | yes | the Drizzle client |
| `deck-og.ts` | **no - add it** | imports `sharp`, a native Node addon |
| `rate-limit.ts` | yes | server-side counter store |
| `reindex.ts` | yes | holds the scoped `MEILI_WRITE_KEY` client |
| `require-user.ts` | yes | session gate |
| `s3.ts` | yes | S3 credentials |
| `search-client.ts` | yes | holds `MEILI_SEARCH_KEY` |
| `session.ts` | yes | `next/headers` |
| `settings-user.ts` | yes | session gate |
| `showcase.ts` | yes | DB reads + `next/cache` |
| `site-settings.ts` | yes | DB reads + `next/cache` |
| `subtype-labels.ts` | yes | DB reads |

**Moves to `lib/actions/` (13):** `auth-actions.ts`, `collection-actions.ts`, `contact-actions.ts`, `deck-actions.ts`, `image-actions.ts`, `localization-actions.ts`, `rulings-actions.ts`, `set-actions.ts`, `settings-actions.ts`, `site-settings-actions.ts`, `sub-type-actions.ts`, `theme-actions.ts`, `user-admin-actions.ts`.

**Test files move with their subject,** keeping the repo's colocated `__tests__` convention:

- to `lib/server/__tests__/` (7): `account-codes.test.ts`, `deck-og.test.ts`, `rate-limit.test.ts`, `reindex.test.ts`, `require-user.test.ts`, `search-client.test.ts`, `site-settings.test.ts`
- to `lib/actions/__tests__/` (12): every `*-actions.test.ts` except `auth-actions` (which has no test file)

**Stays at `lib/` root (34 pure or client-safe helpers):** `admin-nav.ts`, `attribute-labels.ts`, `auth-client.ts`, `brand.ts`, `browse-params.ts`, `card-neighbors.ts`, `card-scatter.ts`, `card-view.ts`, `collection-cards.ts`, `collection-prefs.ts`, `collection-search.ts`, `daily-cards.ts`, `daily-examples.ts`, `deck-groups.ts`, `deck-import.ts`, `deck-legality.ts`, `deck-model.ts`, `deck-png.ts`, `deck-stats.ts`, `deck-view.ts`, `humanize.ts`, `lesson-colors.ts`, `og-image.tsx`, `random.ts`, `redirect-path.ts`, `relative-time.ts`, `roles.ts`, `search-params.ts`, `seo.ts`, `set-sort.ts`, `site.ts`, `sitemap.ts`, `theme.ts`, `utils.ts`.

`roles.ts`, `card-view.ts`, `deck-view.ts`, `collection-cards.ts` and `sitemap.ts` deliberately stay: each is pure functions over types, several are imported by `'use client'` components, and none touches I/O. They do not need and must not get `server-only`.

**Three relative imports need rewriting** because their target stays at `lib/` root while the importer moves:

- `search-client.ts:4` - `'./search-params'` becomes `'@/lib/search-params'`
- `session.ts:4` - `'./roles'` becomes `'@/lib/roles'`
- `__tests__/search-client.test.ts:5` - `'../search-params'` becomes `'@/lib/search-params'`

`session.ts:3` imports `'./auth'`, and `auth.ts` moves into the same folder, so that one is left alone.

**Reference counts to expect.** 141 string occurrences of `'@/lib/<server-module>'` across `src` (import statements and `vi.mock` targets share the same quoted form, so one rewrite pass covers both). `db` accounts for 50 and `session` for 43. Actions add 31 more.

---

### Task 1: Guard the `server-only` import, and close the two gaps

This task lands the actual defect fix. No files move yet - the guard is written against the current flat layout so that the failing assertion, and the fix for it, are visible in one small diff.

**Files:**
- Modify: `app/web/src/lib/auth.ts` (add line 1)
- Modify: `app/web/src/lib/deck-og.ts` (add line 1)
- Create: `app/web/src/lib/__tests__/server-only-guard.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `app/web/src/lib/__tests__/server-only-guard.test.ts`, which Task 2 moves to `app/web/src/lib/server/__tests__/server-only-guard.test.ts` and rewrites to read the directory instead of a hardcoded list.

- [ ] **Step 1: Write the failing test**

Create `app/web/src/lib/__tests__/server-only-guard.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, it, expect } from 'vitest'

// Modules that run only on the server: they hold secrets, open a DB or S3
// connection, read next/headers, or pull in a native Node addon. Importing any
// of them from a client component must fail the build, which is what the
// 'server-only' package does. This list is the contract; Task 2 replaces it
// with a read of the lib/server directory.
const SERVER_MODULES = [
  'account-codes.ts',
  'auth.ts',
  'collection-page-data.ts',
  'db.ts',
  'deck-og.ts',
  'rate-limit.ts',
  'reindex.ts',
  'require-user.ts',
  's3.ts',
  'search-client.ts',
  'session.ts',
  'settings-user.ts',
  'showcase.ts',
  'site-settings.ts',
  'subtype-labels.ts',
]

const libDir = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('server-only guard', () => {
  it.each(SERVER_MODULES)('%s imports server-only', (file) => {
    const source = readFileSync(join(libDir, file), 'utf8')
    expect(source).toMatch(/^import 'server-only'$/m)
  })
})
```

Note `fileURLToPath` is required: `import.meta.url` is a `file://` URL in this vitest
environment, and passing it to `join` unconverted yields a path that does not exist.

- [ ] **Step 2: Run the test and confirm it fails on exactly two modules**

```bash
cd app && /usr/local/bin/npm test -w web -- src/lib/__tests__/server-only-guard.test.ts
```

Expected: 15 cases, 13 pass, **2 fail** - `auth.ts` and `deck-og.ts`. If any other module
fails, stop: the list in the spec is wrong and the plan needs revisiting before you continue.

- [ ] **Step 3: Add the guard to the two modules**

Prepend to `app/web/src/lib/auth.ts`, above `import { betterAuth } from 'better-auth'`:

```ts
import 'server-only'
```

Prepend to `app/web/src/lib/deck-og.ts`, above `import sharp from 'sharp'`:

```ts
import 'server-only'
```

- [ ] **Step 4: Run the test and confirm all 15 pass**

```bash
cd app && /usr/local/bin/npm test -w web -- src/lib/__tests__/server-only-guard.test.ts
```

Expected: 15 passed.

- [ ] **Step 5: Confirm the guard did not break the RSC boundary**

This is the step that matters. `server-only` throws at build time if a client component
reaches the module, so the build is the only check that proves the two new imports are inert.

```bash
cd app && /usr/local/bin/npm run build -w web
```

Expected: build succeeds. If it fails with "This module cannot be imported from a Client
Component", you have found a pre-existing boundary violation - report it and stop rather than
deleting the guard.

- [ ] **Step 6: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add app/web/src/lib/auth.ts app/web/src/lib/deck-og.ts app/web/src/lib/__tests__/server-only-guard.test.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "fix(web): guard auth and deck-og against client imports"
```

---

### Task 2: Extract `lib/server/`

**Files:**
- Create: `app/web/src/lib/server/` (15 modules moved in), `app/web/src/lib/server/__tests__/` (7 tests moved in)
- Modify: `app/web/src/lib/server/__tests__/server-only-guard.test.ts` (rewritten to read the directory)
- Modify: `app/web/src/lib/server/search-client.ts:4`, `app/web/src/lib/server/session.ts:4` (relative imports)
- Modify: ~58 files across `src/` that reference the moved modules

**Interfaces:**
- Consumes: the 15-module list and the guard test from Task 1.
- Produces: `@/lib/server/<name>` as the import path for all 15 modules. Task 3 does not depend on this, but the phase-2 components plan assumes it.

- [ ] **Step 1: Move the modules and their tests**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web/src/lib
mkdir -p server/__tests__
git mv account-codes.ts auth.ts collection-page-data.ts db.ts deck-og.ts rate-limit.ts \
       reindex.ts require-user.ts s3.ts search-client.ts session.ts settings-user.ts \
       showcase.ts site-settings.ts subtype-labels.ts server/
git mv __tests__/account-codes.test.ts __tests__/deck-og.test.ts __tests__/rate-limit.test.ts \
       __tests__/reindex.test.ts __tests__/require-user.test.ts __tests__/search-client.test.ts \
       __tests__/site-settings.test.ts server/__tests__/
git mv __tests__/server-only-guard.test.ts server/__tests__/
```

Note `__tests__/site-settings-actions.test.ts` stays put in this task - it moves in Task 3.
Verify you moved the right one: `ls server/__tests__` must show exactly 8 files.

- [ ] **Step 2: Rewrite every `@/lib/<module>` reference**

The trailing quote in the pattern is load-bearing: without it, `@/lib/auth` would also match
`@/lib/auth-client` and `@/lib/auth-actions`, and `@/lib/site-settings` would swallow
`@/lib/site-settings-actions`.

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web
for n in account-codes auth collection-page-data db deck-og rate-limit reindex \
         require-user s3 search-client session settings-user showcase site-settings subtype-labels; do
  grep -rlF "'@/lib/$n'" --include='*.ts' --include='*.tsx' src \
    | xargs -r sed -i '' "s|'@/lib/$n'|'@/lib/server/$n'|g"
done
```

- [ ] **Step 3: Fix the three relative imports that now point at the wrong folder**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web/src/lib
sed -i '' "s|from './search-params'|from '@/lib/search-params'|" server/search-client.ts
sed -i '' "s|from './roles'|from '@/lib/roles'|" server/session.ts
sed -i '' "s|from '../search-params'|from '@/lib/search-params'|" server/__tests__/search-client.test.ts
```

Leave `server/session.ts`'s `from './auth'` alone - `auth.ts` moved into the same folder.

- [ ] **Step 4: Confirm no stale references survive**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web
for n in account-codes auth collection-page-data db deck-og rate-limit reindex \
         require-user s3 search-client session settings-user showcase site-settings subtype-labels; do
  grep -rn "'@/lib/$n'" --include='*.ts' --include='*.tsx' src
done
```

Expected: no output at all.

- [ ] **Step 5: Retarget the guard to read the directory**

Replace the body of `app/web/src/lib/server/__tests__/server-only-guard.test.ts` with:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, it, expect } from 'vitest'

// Every module in lib/server runs only on the server: it holds secrets, opens a
// DB or S3 connection, reads next/headers, or pulls in a native Node addon.
// Importing one from a client component must fail the build, which is what the
// 'server-only' package does. Reading the directory rather than a fixed list
// means a module dropped in here without the guard fails this test.
const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const modules = readdirSync(serverDir).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))

describe('lib/server', () => {
  it('is not empty', () => {
    expect(modules.length).toBe(15)
  })

  it.each(modules)('%s imports server-only', (file) => {
    const source = readFileSync(join(serverDir, file), 'utf8')
    expect(source).toMatch(/^import 'server-only'$/m)
  })
})
```

The `is not empty` case is there so a broken path silently yielding zero files reads as a
failure rather than as a vacuously green `it.each`.

- [ ] **Step 6: Run the full verification**

```bash
cd app
/usr/local/bin/npm run typecheck
/usr/local/bin/npm test
/usr/local/bin/npm run lint -w web
/usr/local/bin/npm run build -w web
```

Expected: typecheck clean; 706 tests pass across 149 files (the count is unchanged - files
moved, none were added or removed beyond the one guard file from Task 1); lint clean; build
succeeds.

- [ ] **Step 7: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add -A app/web/src
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(web): move server-only modules into lib/server"
```

---

### Task 3: Extract `lib/actions/`

**Files:**
- Create: `app/web/src/lib/actions/` (13 modules), `app/web/src/lib/actions/__tests__/` (12 tests)
- Modify: ~30 files across `src/` that reference the moved actions

**Interfaces:**
- Consumes: the post-Task-2 tree. Action modules import `@/lib/server/db`, `@/lib/server/session` and friends; Task 2 already rewrote those paths inside them, so no further edit is needed there.
- Produces: `@/lib/actions/<name>` as the import path for all 13 Server Action modules.

- [ ] **Step 1: Move the modules and their tests**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web/src/lib
mkdir -p actions/__tests__
git mv auth-actions.ts collection-actions.ts contact-actions.ts deck-actions.ts \
       image-actions.ts localization-actions.ts rulings-actions.ts set-actions.ts \
       settings-actions.ts site-settings-actions.ts sub-type-actions.ts \
       theme-actions.ts user-admin-actions.ts actions/
git mv __tests__/collection-actions.test.ts __tests__/contact-actions.test.ts \
       __tests__/deck-actions.test.ts __tests__/image-actions.test.ts \
       __tests__/localization-actions.test.ts __tests__/rulings-actions.test.ts \
       __tests__/set-actions.test.ts __tests__/settings-actions.test.ts \
       __tests__/site-settings-actions.test.ts __tests__/sub-type-actions.test.ts \
       __tests__/theme-actions.test.ts __tests__/user-admin-actions.test.ts actions/__tests__/
```

`ls actions` must show 14 entries (13 modules + `__tests__`), and `ls actions/__tests__` 12.

- [ ] **Step 2: Rewrite every `@/lib/<action>` reference**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web
for n in auth-actions collection-actions contact-actions deck-actions image-actions \
         localization-actions rulings-actions set-actions settings-actions \
         site-settings-actions sub-type-actions theme-actions user-admin-actions; do
  grep -rlF "'@/lib/$n'" --include='*.ts' --include='*.tsx' src \
    | xargs -r sed -i '' "s|'@/lib/$n'|'@/lib/actions/$n'|g"
done
```

- [ ] **Step 3: Confirm no stale references survive**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web
for n in auth-actions collection-actions contact-actions deck-actions image-actions \
         localization-actions rulings-actions set-actions settings-actions \
         site-settings-actions sub-type-actions theme-actions user-admin-actions; do
  grep -rn "'@/lib/$n'" --include='*.ts' --include='*.tsx' src
done
```

Expected: no output.

- [ ] **Step 4: Confirm `lib/` root is down to the intended 34 helpers**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio/app/web/src/lib && ls -1 *.ts *.tsx | wc -l
```

Expected: `34`. That is the 34 pure helpers listed in the File Structure section plus nothing
else - if the number is higher, a module that should have moved did not.

- [ ] **Step 5: Run the full verification**

```bash
cd app
/usr/local/bin/npm run typecheck
/usr/local/bin/npm test
/usr/local/bin/npm run lint -w web
/usr/local/bin/npm run build -w web
```

Expected: all four clean, 706 tests passing.

- [ ] **Step 6: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add -A app/web/src
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "refactor(web): move server actions into lib/actions"
```

---

### Task 4: Document the boundary and open the PR

**Files:**
- Modify: `CLAUDE.md` (the "Web app specifics" bullets that name `src/lib/*-actions.ts` and `src/lib/reindex.ts`)

**Interfaces:**
- Consumes: the finished tree from Task 3.
- Produces: nothing code-facing.

- [ ] **Step 1: Update the two stale paths in CLAUDE.md**

In the "Web app specifics" section, the Server Actions bullet currently reads
`**Server Actions** in `src/lib/*-actions.ts``. Change that path to `src/lib/actions/`.
In the same section, the Meilisearch bullet names ``getWriteClient()` in `src/lib/reindex.ts``.
Change that path to `src/lib/server/reindex.ts`.

Then add one bullet after them:

```markdown
- **`src/lib` is split by runtime.** `lib/server/` holds server-only modules (DB, S3, auth,
  session, search client) and every file there must start with `import 'server-only'` - a test
  in `lib/server/__tests__/server-only-guard.test.ts` enforces it. `lib/actions/` holds the
  `'use server'` modules. Pure, isomorphic helpers stay at `lib/` root; `utils.ts` must stay
  there because `components.json` pins `aliases.utils` to `@/lib/utils`.
```

- [ ] **Step 2: Confirm no other doc references a moved path**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
grep -rn "lib/reindex\|lib/db\.ts\|lib/\*-actions\|lib/auth\.ts\|lib/session\.ts" --include='*.md' .
```

Expected: only hits inside `docs/superpowers/` plan and spec files that describe history.
Leave those alone - they are dated records of what was true when written. Fix anything in
`CLAUDE.md`, `README.md`, or `docs/MIGRATIONS.md`.

- [ ] **Step 3: Commit**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git add CLAUDE.md
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "docs: describe the lib server and actions split"
```

- [ ] **Step 4: Push and open the PR**

```bash
cd /Users/timon.wegener/WebstormProjects/revelio
git push -u origin refactor/lib-server-boundary
/opt/homebrew/bin/gh pr create --title "refactor(web): split lib by runtime boundary" --body "$(cat <<'BODY'
Splits the 62-file flat `app/web/src/lib` into three runtime groups so the server/client
boundary is a directory rule instead of a naming convention.

- `lib/server/` - 15 modules that hold secrets or open connections. Every one now starts with
  `import 'server-only'`; `lib/server/__tests__/server-only-guard.test.ts` fails if a module
  is added without it.
- `lib/actions/` - the 13 `'use server'` modules.
- `lib/` root - 34 pure, isomorphic helpers, unchanged. `utils.ts` stays put because
  `components.json` pins `aliases.utils` to `@/lib/utils`.

The substantive fix is the first commit: `lib/auth.ts` (Better Auth config, Drizzle client,
`BETTER_AUTH_SECRET`) and `lib/deck-og.ts` (native `sharp` addon) were missing the guard.

Everything after that is a move plus an import rewrite - no signature, query, or rendered
output changes. Verified with typecheck, the full 706-test suite, lint, and `next build`
(the only check that exercises the RSC boundary).

Spec: `docs/superpowers/specs/2026-08-21-web-source-layout-design.md`
Plan: `docs/superpowers/plans/2026-08-21-lib-server-boundary.md`

Follow-up PR groups the 98-file `src/components` folder by domain.
BODY
)"
```
