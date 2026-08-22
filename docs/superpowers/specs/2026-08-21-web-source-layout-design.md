# Web Source Layout - Design

## Problem

`app/web/src` follows the layout Next.js documents: `src/` + App Router, a top-level
`components/` and `lib/`, the `@/*` alias, no barrel files, `__tests__` colocated. Nothing
here is broken and nothing violates a documented Next.js practice. The layout has simply
outgrown the flat variant it started in.

Two measured symptoms:

**`src/lib/` mixes runtimes in one folder.** Its 62 flat modules span four kinds:

| kind | count | examples |
|---|---|---|
| Server Actions (`'use server'`) | 13 | `deck-actions.ts`, `settings-actions.ts` |
| server-only runtime | 15 | `db.ts`, `auth.ts`, `s3.ts`, `session.ts`, `reindex.ts`, `deck-og.ts` |
| isomorphic pure helpers | ~34 | `humanize.ts`, `deck-legality.ts`, `roles.ts`, `sitemap.ts` |
| client-facing | 3 | `auth-client.ts`, `search-params.ts`, `theme.ts` |

14 of the 15 server-runtime modules carry `import 'server-only'`. Two do not:

- `lib/auth.ts` - the Better Auth config. It constructs a Drizzle client, reads
  `BETTER_AUTH_SECRET`, and wires the mailer. This is the single worst module in the tree to
  pull into a client bundle, and only naming convention currently prevents it.
- `lib/deck-og.ts` - imports `sharp`, a native Node addon that cannot bundle for the browser.
  It would fail at build time rather than leak a secret, but the guard belongs there too.

Sorting the enforceable modules into `lib/server/` and `lib/actions/` turns a naming
convention into a directory rule, and makes "does every file in `lib/server/` start with
`import 'server-only'`?" a question a test can answer.

**`src/components/` is a 98-file flat bucket.** 58 of the 98 have exactly one consumer -
`deck-hero-card` is used only by `deck-browse`, `collection-sidebar` only by
`collection-set-nav`. That is a dependency tree flattened into an alphabetical list. The
filenames already carry the grouping the folders should (19 `deck-*`, 11 `card-*`,
8 `collection-*`, 4 `search-*`), and the repo already contains the target pattern twice:
`components/settings/` and `components/legal/`, both with the folder-scoped `types.ts` that
CLAUDE.md prescribes.

**`app/web/test/` is named as though it held tests.** It holds two module stubs that nothing
imports - vitest swaps them in via `resolve.alias` for `server-only` and `next/font/google`.
Beside `e2e/` (Playwright specs) and `src/test/` (a real `renderWithIntl` helper imported as
`@/test/intl`), it is the one of the three whose name says nothing true about its contents.
Renaming it to `vitest-stubs/` is a two-line change to `vitest.config.ts`.

## Non-goals

- **No colocation into `app/` route folders.** 40 components have two or more consumers, and
  the route tree under `[locale]/` is already the densest part of the repo. Domain folders
  under `components/` keep the `@/components/...` alias shape and match the in-repo
  precedent.
- **No barrel files.** `components/deck/index.ts` would re-couple everything the split
  decouples and would cost bundling. Import the leaf path.
- **No `lib/shared/`.** Moving the ~34 pure helpers down a level buys no enforcement, and
  `@/lib/utils` is pinned by `components.json` (`aliases.utils`), so moving it would fight
  the shadcn CLI. Pure helpers stay at `lib/` root.
- **No behaviour change anywhere.** Every task in both plans is a move plus an import
  rewrite. If a rendered pixel or a query changes, the task is wrong.

## Target structure

```
src/
  app/                       # routes only - unchanged
  components/
    ui/                      # shadcn primitives - unchanged
    settings/  legal/        # already grouped - unchanged
    card/  deck/  collection/  search/  admin/  auth/  layout/
    <8 generic leftovers>    # date-picker, error-card-state, responsive-sidebar, ...
  lib/
    server/                  # 15 modules, every one starts `import 'server-only'`
    actions/                 # 13 `'use server'` modules
    email/  schemas/  fonts/ # already grouped - unchanged
    <34 pure helpers>        # unchanged at lib/ root, incl. utils.ts
  hooks/
  test/                      # renderWithIntl helper - unchanged
vitest-stubs/                # was test/ - alias targets, not tests
e2e/                         # Playwright - unchanged
```

## Rationale for the split into two PRs

Phase 1 (`lib/`) is 100 import references across 58 files and carries the only real risk in
the whole refactor. Phase 2 (`components/`) is a much larger diff - roughly 150 import lines -
with no risk behind it. Landing them together would bury phase 1's substance under phase 2's
churn.

## Verification

Both phases are verified the same way, because both are pure moves:

- `npm run typecheck` - resolves every non-test import.
- `npm test` - 149 files / 706 tests, including the `vi.mock('@/lib/...')` paths that move.
- `npm run lint -w web`.
- `npm run build -w web` - the only check that exercises the RSC boundary, and therefore the
  only one that would catch a `server-only` module reached from a client component.

Note the vitest config aliases `server-only` to `test/empty.ts`, so adding the import to
`auth.ts` and `deck-og.ts` cannot break the test run.

## Accepted risk

No client component currently imports any of the 15 modules destined for `lib/server/` -
verified by scanning every `'use client'` file for `@/lib/<name>` references. Adding
`import 'server-only'` to the two modules missing it is therefore expected to be inert. If
the build fails after that change, the failure is a pre-existing boundary violation the guard
has surfaced, not a regression introduced by the move.
