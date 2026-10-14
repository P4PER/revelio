# E2E: fail instead of skip on a seeded stack

Follow-up from PR #158, whose notes listed it as open.

## Problem

Four e2e tests need card data (`search`, `advanced-search`, and the two in `detail`). Each
one checks whether a result is visible and calls `test.skip` when it is not, so a suite run
against an empty stack stays green. On a stack that *is* seeded, the same check means a
search, a sets page or a Meilisearch connection that broke and renders nothing also turns
into a skip. The run is still green, and the tests that should have caught the break never
ran. The check is also racy: three of the four call `isVisible()` right after `goto`,
which does not wait for anything, so a slow render skips the test too.

## Change

1. New `web/e2e/seeded.ts` exporting `requireSeeded(locator, what)`. It waits up to 5 s for
   the locator to become visible. If it does not:
   - with `E2E_REQUIRE_SEED=1`, the test fails with a message naming what was missing and
     the flag
   - otherwise it skips, with the same reason the specs give today
2. `search.spec`, `advanced-search.spec` and `detail.spec` call it in place of their
   inline `isVisible` + `test.skip`.
3. `og-and-icons.spec`'s public-deck test keeps its plain skip. Ingest seeds cards and
   sets but no decks, so on an ingest-seeded stack the flag would fail it every time. A
   comment there says so.
4. Document the flag in `playwright.config.ts` and in CLAUDE.md's command list.

CI does not run e2e today, so wiring the flag into CI is out of scope.

## Verification

- `E2E_REQUIRE_SEED=1 E2E_PORT=3100 npm run e2e -w web` against the local seeded stack:
  all green.
- With `MEILI_HOST` pointed at a dead port, the search-backed specs in `detail` and
  `advanced-search` fail with the flag and skip without it. `search.spec` fails either
  way, because it asserts the count row before the seed check: an unreachable index renders
  no count, while an empty one renders "0 cards" and reaches the skip.
- `npm run typecheck`, `npm run lint`.
