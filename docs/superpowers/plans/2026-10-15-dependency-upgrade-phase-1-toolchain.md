# Dependency Upgrade Phase 1: Toolchain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the build/test toolchain (TypeScript 6, Vitest 5, Vite 8, esbuild 0.28, Testcontainers 12) and every in-range dependency to latest, on a regenerated lockfile, with all checks green.

**Architecture:** Manifest edits plus one tsconfig fix. No application code changes. TypeScript 6's `types: []` default is the only source-level breakage.

**Tech Stack:** npm workspaces (`app/`), TypeScript, Vitest, Vite, esbuild, Next.js 16, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-15-dependency-upgrade-design.md`

## Global Constraints

- All commands run from `app/`, with `PATH=/usr/local/bin:/opt/homebrew/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH`.
- TypeScript stays `<6.1` (typescript-eslint peer range). ESLint stays on 9.x. `@types/node` stays on `^22`.
- `next`, `react`, `react-dom` and `eslint-config-next` keep **exact** pins (no caret), as today.
- zod, meilisearch, @tanstack/react-table, react-day-picker, nodemailer, @react-email/*, jsdom and @testing-library/jest-dom are **not** touched in this phase. They belong to phases 2-5.
- Never run a bare `npm test` against the dev Meilisearch. Every test run sets `TEST_MEILI_HOST=http://localhost:7799 TEST_MEILI_KEY=masterKey` against `docker run -d --rm --name tmp-meili -p 7799:7700 -e MEILI_MASTER_KEY=masterKey -e MEILI_NO_ANALYTICS=true getmeili/meilisearch:v1.10`, plus `TEST_S3_ENDPOINT=http://localhost:9000 TEST_S3_ACCESS_KEY=rustfsadmin TEST_S3_SECRET_KEY=rustfsadmin`.
- Commits: Conventional Commits, no attribution, signed via `git -c gpg.program=/opt/homebrew/bin/gpg commit`.

## Review Focus

- CI runs Node 22 while local runs Node 25. Vitest 5's engines are `^22.12 || ^24 || >=26`, so the suite must also pass under `/usr/local/n/versions/node/22.18.0/bin`.
- An esbuild bundle can build clean and still fail at boot (the `createRequire` banner case). Only `docker build` of bot/ingest/sheet, whose build stages boot the bundle, proves it.
- `next build` type-checks through `tsconfig.typecheck.json`. The `mdx` types fix must reach that path, not just `tsc`.
- The e2e suite needs a prod build. Run it with `E2E_PORT=3100` and re-seed the index if a test run wiped it.
- A regenerated lockfile can move transitive majors silently. `npm ls --all 2>&1 | grep -E "invalid|UNMET"` must be empty.

---

### Task 1: Bump manifests and regenerate the lockfile

**Files:**
- Modify: `app/package.json`, `app/web/package.json`, `app/ingest/package.json`, `app/db/package.json`, `app/bot/package.json`, `app/sheet/package.json`
- Regenerate: `app/package-lock.json`

- [ ] **Step 1: Edit root devDependencies** (`app/package.json`). Resulting block:

```json
  "devDependencies": {
    "typescript": "^6.0.3",
    "eslint": "^9.39.5",
    "typescript-eslint": "^8.71.2",
    "tsx": "^4.23.15",
    "vitest": "^5.0.5",
    "vite": "^8.3.4",
    "@types/node": "^22.20.5",
    "@testcontainers/postgresql": "^12.2.1",
    "drizzle-kit": "^0.31.11",
    "esbuild": "^0.28.2"
  }
```

- [ ] **Step 2: Edit workspace manifests** with `npm pkg set` so formatting is kept:

```bash
npm pkg set -w @revelio/db dependencies.drizzle-orm='^0.45.4' dependencies.postgres='^3.4.9'
npm pkg set -w @revelio/ingest dependencies.drizzle-orm='^0.45.4' dependencies.postgres='^3.4.9' dependencies.better-auth='^1.7.10' dependencies.@aws-sdk/client-s3='^3.1152.0'
npm pkg set -w @revelio/bot dependencies.drizzle-orm='^0.45.4' dependencies.postgres='^3.4.9'
npm pkg set -w @revelio/sheet dependencies.sharp='^0.35.5'
npm pkg set -w web \
  dependencies.@aws-sdk/client-s3='^3.1152.0' dependencies.@hookform/resolvers='^5.9.1' \
  dependencies.@next/mdx='^16.4.2' dependencies.@radix-ui/react-separator='^1.2.0' \
  dependencies.better-auth='^1.7.10' dependencies.input-otp='^1.5.0' dependencies.lucide-react='^1.57.0' \
  dependencies.next='16.4.2' dependencies.next-intl='^4.14.9' dependencies.radix-ui='^1.8.1' \
  dependencies.rate-limiter-flexible='^11.2.2' dependencies.react='19.3.1' dependencies.react-dom='19.3.1' \
  dependencies.react-hook-form='^7.90.0' dependencies.shadcn='^4.21.5' dependencies.sharp='^0.35.5' \
  dependencies.sonner='^2.0.8' dependencies.tailwind-merge='^3.7.0' \
  devDependencies.@playwright/test='^1.64.1' devDependencies.@tailwindcss/postcss='^4.3.3' \
  devDependencies.@testing-library/dom='^10.4.2' devDependencies.@testing-library/react='^16.3.3' \
  devDependencies.@testing-library/user-event='^14.6.8' devDependencies.@types/node='^22.20.5' \
  devDependencies.@types/react='^19.3.0' devDependencies.@types/react-dom='^19.3.0' \
  devDependencies.@vitejs/plugin-react='^6.1.2' devDependencies.eslint='^9.39.5' \
  devDependencies.eslint-config-next='16.4.2' devDependencies.tailwindcss='^4.3.3' \
  devDependencies.typescript='^6.0.3' devDependencies.vitest='^5.0.5'
```

`@types/nodemailer` stays (phase 4 decides). `jsdom` and `@testing-library/jest-dom` stay (phase 5).

- [ ] **Step 3: Regenerate the lockfile.** An in-place install keeps stale hoisted copies:

```bash
mv package-lock.json /tmp/claude-502/old-lock.json
npm install
```

- [ ] **Step 4: Verify the tree.** Expected: no output from the first command. The second shows one copy each of `typescript@6.0.3`, `vitest@5.0.5`, `vite@8.3.4`.

```bash
npm ls --all 2>&1 | grep -E "invalid|UNMET"
npm ls typescript vitest vite --all | grep -oE "(typescript|vitest|vite)@[0-9.]+" | sort -u
```

The `zod` `invalid` from `better-call` is the exception. It exists on `main` today and phase 2 removes it. Note it in the PR.

- [ ] **Step 5: Run typecheck to see the TS 6 breakage.**

Run: `npm run typecheck`
Expected: FAIL. `TS2591 Cannot find name 'process'` in db/ingest/search, and `TS2322 ... 'typeof import("*.mdx")' is not assignable to type 'MDXContent'` in web.

### Task 2: Restore ambient types under TypeScript 6

**Files:**
- Modify: `app/tsconfig.base.json`
- Modify: `app/web/tsconfig.json`

- [ ] **Step 1: Add `types` to the base config.** `app/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  }
}
```

- [ ] **Step 2: Add `types` to web.** In `app/web/tsconfig.json` `compilerOptions`, after `"incremental": true,`:

```json
    "types": ["node", "mdx"],
```

`mdx` restores `@types/mdx`'s `declare module '*.mdx'` default export. `web/mdx/mdx.d.ts` only adds `toc`.

- [ ] **Step 3: Run typecheck and lint.**

Run: `npm run typecheck && npm run lint`
Expected: both exit 0. If a test-only global (e.g. vitest `globals`) is now missing in a `tsconfig.json` that includes `test`, add `"vitest/globals"` to that workspace's `types` only, and only if `tsc -p <ws>/tsconfig.json` shows it.

- [ ] **Step 4: Commit.**

```bash
git add package.json package-lock.json */package.json tsconfig.base.json web/tsconfig.json
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "build(deps): upgrade toolchain to typescript 6, vitest 5 and vite 8" -m "TypeScript 6 defaults compilerOptions.types to [], so @types/node and
@types/mdx are listed explicitly. The lockfile is regenerated: an in-place
install kept vitest 2 and 3 side by side and a hoisted zod 3."
```

### Task 3: Test suites on Vitest 5

**Files:**
- Modify (only if the run reports a deprecation or failure): `app/web/vitest.config.mts`, `app/ingest/vitest.config.ts`

- [ ] **Step 1: Run every workspace** against the throwaway Meilisearch:

```bash
docker run -d --rm --name tmp-meili -p 7799:7700 -e MEILI_MASTER_KEY=masterKey -e MEILI_NO_ANALYTICS=true getmeili/meilisearch:v1.10
export TEST_MEILI_HOST=http://localhost:7799 TEST_MEILI_KEY=masterKey TEST_S3_ENDPOINT=http://localhost:9000 TEST_S3_ACCESS_KEY=rustfsadmin TEST_S3_SECRET_KEY=rustfsadmin
for w in core search ingest web bot sheet; do npm test -w $w 2>&1 | tee /tmp/claude-502/t-$w.log | grep -E "^ +(Test Files|Tests) "; done
grep -hiE "deprecat" /tmp/claude-502/t-*.log | sort -u
```

Expected counts (baseline): core 109, search 52, ingest 147, web 1332, bot 402, sheet 73, all passed.

- [ ] **Step 2: Fix any Vitest 5 config deprecation** printed by the grep. A known one is `test.server.deps.inline` in `web/vitest.config.mts`, which moved to `test.deps.optimizer` / `server.deps`. Apply exactly the replacement the warning names, re-run `npm test -w web`, and expect the same 1332.

- [ ] **Step 3: Re-run under CI's Node 22.**

```bash
PATH=/usr/local/n/versions/node/22.18.0/bin:$PATH /usr/local/n/versions/node/22.18.0/bin/npm test -w web
```

Expected: 1332 passed. If Vitest refuses the engine, CI's `setup-node` resolves the latest 22.x, so record the minimum in `.github/actions/setup-app/action.yml` as `node-version: 22.12` only if 22.18 fails.

- [ ] **Step 4: Commit** (only if Step 2 changed a file):

```bash
git add web/vitest.config.mts ingest/vitest.config.ts
git -c gpg.program=/opt/homebrew/bin/gpg commit -m "test(web): move vitest config off options vitest 5 deprecates"
```

### Task 4: Builds, bundles and e2e

**Files:** none expected to change.

- [ ] **Step 1: Next build.**

Run: `npm run build -w web` (env from `web/.env.local`)
Expected: exit 0, no type errors.

- [ ] **Step 2: Bundles and images.** Each Dockerfile boots its bundle in the build stage:

```bash
for s in bot ingest sheet web; do docker build -f $s/Dockerfile -t revelio-$s:upgrade-check . || echo "FAIL $s"; done
```

Expected: no `FAIL` lines.

- [ ] **Step 3: Playwright browser and e2e.**

```bash
npx -w web playwright install chromium
E2E_REQUIRE_SEED=1 npm run e2e -w web
```

Expected: the same pass/skip count as `main`. If `search.spec.ts` fails, check `curl -s -H "Authorization: Bearer masterKey" localhost:7700/indexes` first (a test run may have wiped the dev index).

### Task 5: Pull request

- [ ] **Step 1:** `git push -u origin chore/upgrade-dependencies`
- [ ] **Step 2:** `gh pr create --title "build(deps): upgrade toolchain to typescript 6, vitest 5 and vite 8"`. The body opens with prose, then `## What changed`, `## Blocked upgrades` (TS 7, ESLint 10, @types/node 26, with the peer ranges), `## Verification` (one bullet per command above with its real result), `## Deployment` (all four images rebuild from the new lockfile), and links the spec.
