# Dependency Upgrade (October 2026) - Design

Bring every npm dependency under `app/` to its latest release, or to the latest release a
peer constraint allows, and fix what each upgrade breaks. The work ships as five PRs, one
per phase, so that each one can be reverted on its own.

## Method

Before writing this spec, every package was bumped to its target at once on a throwaway
tree (fresh lockfile, `npm install`), and `npm run typecheck`, `npm run lint` and every
workspace's `npm test` were run against it (the ingest suite on a throwaway Meilisearch on
`:7799`, see the `npm-test-wipes-dev-meilisearch` note). The breakages below are what that
probe actually reported, not what changelogs predicted. Baseline on `main` (fe5b379d):
typecheck and lint clean; tests core 109, search 52, ingest 147, web 1332, bot 402, sheet
73, all green.

## Targets

Versions are the `npm view <pkg> version` of 2026-10-15.

| Package | From | To | Workspaces | Phase |
|---|---|---|---|---|
| typescript | 5.9.3 | **6.0.3** (not 7.0.2, see Blocked) | root, web | 1 |
| vitest | 2.1.9 (root) / 3.2.6 (web) | **5.0.5**, one copy | root, web | 1 |
| vite | (transitive 5.4) | **8.3.4**, now a direct devDependency | root | 1 |
| @vitejs/plugin-react | 4.7.0 | **6.1.2** | web | 1 |
| @testcontainers/postgresql | 10.28.0 | **12.2.1** | root | 1 |
| esbuild | 0.25.12 | **0.28.2** | root | 1 |
| typescript-eslint | 8.62.1 | 8.71.2 | root | 1 |
| eslint | 9.39.4 | 9.39.5 (not 10, see Blocked) | root, web | 1 |
| tsx, drizzle-kit, drizzle-orm, postgres | patch/minor | latest | several | 1 |
| next, eslint-config-next, @next/mdx | 16.3.x | 16.4.2 | web | 1 |
| react, react-dom | 19.2.8 | 19.3.1 | web | 1 |
| @types/node | 22.20.1 | 22.20.5 (stays on 22, see Blocked) | root (new), web | 1 |
| every other in-range minor/patch (`npm outdated` "Wanted") | | latest | web, ingest, sheet | 1 |
| zod | 3.25.76 | **4.6.7** | core, web, bot, sheet | 2 |
| meilisearch | 0.45.0 | **0.62.0** | search | 3 |
| @tanstack/react-table | 8.21.3 | **9.3.1** | web | 4 |
| react-day-picker | 9.14.0 | **10.0.2** | web | 4 |
| nodemailer | 9.0.3 | **10.1.1** | web | 4 |
| @react-email/components | 1.0.12 (deprecated) | **react-email 6.11.2** | web | 4 |
| jsdom | 26.1.0 | **29.1.1** | web | 5 |
| @testing-library/jest-dom | 6.9.1 | **7.0.1** | web | 5 |

## Blocked (deliberately not upgraded)

- **TypeScript 7.0.** `typescript-eslint@8.71.2` declares `typescript: ">=4.8.4 <6.1.0"`,
  and every workspace lints with type-aware rules. Revisit when typescript-eslint widens
  that range.
- **ESLint 10.** `eslint-config-next@16.4.2` depends on `eslint-plugin-react@^7.37`,
  `eslint-plugin-import@^2.32` and `eslint-plugin-jsx-a11y@^6.10`, whose peer ranges stop
  at ESLint 9. Revisit when Next's config moves.
- **@types/node 26.** The runtime is Node 22 (`node:22-alpine` in all four Dockerfiles,
  `node-version: 22` in `.github/actions/setup-app`). Node's types track the runtime
  major; 26's types would admit APIs that do not exist in production.
- **Out of scope:** container images (`getmeili/meilisearch:v1.10`, `postgres:16-alpine`,
  `rustfs`, `node:22-alpine`), GitHub Actions versions and the Python pipeline in
  `card-data/`. They are not npm libraries, and each one is a runtime change with a
  deployment of its own.

## What breaks, and the fix

### Phase 1 - toolchain and in-range updates

- **TypeScript 6 defaults `compilerOptions.types` to `[]`.** Ambient `@types/*` packages
  are no longer picked up automatically. The probe reported 60+ `TS2591: Cannot find name
  'process' / 'node:path'` errors in `db`, `ingest` and `search`, and 9 MDX errors in web
  (`typeof import("*.mdx")` not assignable to `MDXContent`), because `@types/mdx` dropped
  out and `web/mdx/mdx.d.ts` alone gives `*.mdx` no default export. Fix: `"types":
  ["node"]` in `tsconfig.base.json`, `"types": ["node", "mdx"]` in `web/tsconfig.json`, and
  `@types/node` as a root devDependency. The root never declared it; it only resolved by
  hoisting from web.
- **The lockfile is regenerated** (`package-lock.json` deleted, `npm install`). An
  in-place `npm install` keeps the stale hoisted copies (zod 3 at the top level, two
  vitests, testcontainers 10) and reports `invalid` in `npm ls`. A fresh lock dedupes
  vitest, which is the root cause the `web-test-files-are-not-typechecked` note names for
  the ~355 missing jest-dom matcher types. Making web's test files typecheck is still not
  part of this work.
- **Vitest 5 no longer brings Vite**, which became a peer (`^6.4 || ^7 || ^8`), and
  `@vitejs/plugin-react@6` requires `vite@^8`. Vite becomes an explicit root
  devDependency.
- **esbuild 0.28** builds the `bot`, `ingest` and `sheet` bundles. The three Dockerfiles
  boot each bundle in their build stage. That boot check and the `createRequire` banner
  are what prove the bundles are still sound.

### Phase 2 - zod 4

- `better-call` (under better-auth) already requires `zod@^4` and is resolved against 3.25
  today (`npm ls` marks it `invalid`). Moving to zod 4 fixes that.
- One type error: `web/src/components/auth/auth-form.tsx`. `makeEmailStepSchema` returns a
  union of two object schemas (register / login), and with zod 4 `@hookform/resolvers`
  infers `name: string | undefined` as a required key, which no longer matches
  `useForm<{ email: string; name?: string }>`. Fix: a named `EmailStepValues` type and an
  explicit `z.ZodType<EmailStepValues, EmailStepValues>` return type on the factory.
- No runtime test failed under zod 4. The `.url()` + `.refine` behaviour that
  `bot/src/env.ts` and `sheet/src/env.ts` depend on still holds, and their tests pin it.
  Deprecated-but-working spellings (`z.string().email()`, `{ message }`) stay. Rewriting
  them is churn without a behaviour change.

### Phase 3 - meilisearch 0.62

- `MeiliSearch` was renamed `Meilisearch` (class and type). This affects 13 files across
  `search`, `ingest`, `web` and `bot`.
- `client.waitForTask(uid)` moved to the task API: enqueued-task promises now carry
  `.waitTask()`, and `client.tasks.waitForTask(uid)` replaces the top-level method. The
  probe could not surface these, because the import error made the client type `any`.
  `ingest/src/index-cards.ts` and the test helpers in `search/test`,
  `web/src/lib/server/__tests__` and `web/src/lib/__tests__` call it.
- The client supports any Meilisearch v1.x. The federated multi-search
  `search/src/search.ts` relies on needs server >= 1.10, which compose and CI pin. The
  integration suites run against that same v1.10 image.

### Phase 4 - web UI libraries

- **TanStack Table 9** replaces `useReactTable` with `useTable` plus an explicit
  `tableFeatures({...})` registry. Row models become feature slots
  (`createFilteredRowModel()` ...), `FilterFn`/`ColumnDef` take a `TFeatures` generic
  first, and `table.getState()` becomes `table.state`. This breaks
  `admin-users-table.tsx` and `admin-sets-table.tsx` (41 type errors, 13 failing tests).
  The features they need are `columnFilteringFeature` (prerequisite),
  `globalFilteringFeature`, `rowSortingFeature` and `rowPaginationFeature`.
- **react-day-picker 10** removes only the `DeprecatedUI` class keys, which
  `components/ui/calendar.tsx` does not use. It typechecks and passes unchanged. A
  visual check of the date picker is still owed.
- **nodemailer 10** needs Node >= 20 and is now written in TypeScript with its own types.
  `@types/nodemailer` is dropped if the bundled types cover `lib/email/mailer.ts`.
- **@react-email/components is deprecated** ("Package no longer supported", on it and
  all of its `@react-email/*` sub-packages). It is already at its newest version, so
  `npm outdated` never lists it. Only the install-time deprecation warning reveals it.
  The successor is `react-email`: the same repository (`resend/react-email`) and the same
  maintainers, and version 6 exports every component the templates import (`Body`,
  `Container`, `Heading`, `Hr`, `Html`, `Link`, `Section`, `Text`).
  `@react-email/render` 2.1.0 is not deprecated and stays.

### Phase 5 - test environment

- **jsdom 29** fails 5 web tests that pass under jsdom 26 with every other bump applied
  (verified by swapping jsdom alone). Each was diagnosed by running it under jsdom 29:
  - `card-nav.test.tsx`: jsdom 29 still lacks `AnimationEvent` but now knows the
    `WebkitAnimation` style property, so React listens for `webkitAnimationEnd`. Fix: an
    `AnimationEvent` in the test setup, as every browser has (verified, 16/16).
  - `deck-sheet.test.tsx`: jsdom 29 has a real `PointerEvent`, so the test's upward drag
    now travels, and on cancel it snaps the sheet open before the tap. Fix: drag down in
    the test (verified). Mutation-check that the latch regression is still caught.
  - `filter-rail.test.tsx` (2 tests): jsdom 29 rejects a `calc()` stop inside a gradient,
    which is valid CSS, so `maskImage` is set to `""`. Fix: the moving stops become custom
    properties under a static `lane-fade` utility.
  - `appearance-form.test.tsx`: jsdom 29 reports `display: inline` for spans (26 gave
    `""`), so the unstyled label's name loses the space a browser's `flex-col` gives it.
    Fix: an anchored regex that tolerates only that space.

  A jsdom change that is closer to browsers is fixed in the test. jsdom's one real bug
  (`calc()` in a gradient) is worked around in the component, which keeps identical
  rendering, checked by screenshot.
- **@testing-library/jest-dom 7** requires Node >= 22. The probe raised no failures
  attributable to it.

## Phases

| # | Plan | PR scope |
|---|---|---|
| 1 | [toolchain](../plans/2026-10-15-dependency-upgrade-phase-1-toolchain.md) | TS 6, Vitest 5, Vite 8, esbuild, testcontainers, in-range bumps, new lockfile |
| 2 | [zod 4](../plans/2026-10-15-dependency-upgrade-phase-2-zod.md) | zod 4 across four workspaces |
| 3 | [meilisearch](../plans/2026-10-15-dependency-upgrade-phase-3-meilisearch.md) | meilisearch-js 0.62 |
| 4 | [web libraries](../plans/2026-10-15-dependency-upgrade-phase-4-web-libs.md) | TanStack Table 9, DayPicker 10, nodemailer 10, react-email |
| 5 | [test env](../plans/2026-10-15-dependency-upgrade-phase-5-test-env.md) | jsdom 29, jest-dom 7 |

Each phase branches from `main` after the previous phase merged: phase 1 regenerates the
lockfile, and later phases install on top of it. Each PR's `## Verification` lists
typecheck, lint, every workspace's test count, `next build`, and for phases 1 and 4 the
Docker image builds and a Playwright e2e run.

## Deployment

None of the phases needs a migration, an env var or an ingest run. Phase 3 changes no
index settings. All four images rebuild from the new lockfile, so the phase 1 PR notes
that the next deploy ships new runtime dependencies for every service.
