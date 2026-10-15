import { test, expect, type Locator } from '@playwright/test'

// Without data these specs have nothing to test, so by default they skip and a
// bare `npm run e2e` against an empty stack stays green. On a stack known to be
// seeded that same skip would hide a break - a search that renders nothing looks
// exactly like an empty index - so E2E_REQUIRE_SEED=1 turns it into a failure.
const REQUIRE_SEED = process.env.E2E_REQUIRE_SEED === '1'

// Under the flag a miss is a failure that blames seeding, so give a cold
// production server's first Meilisearch query or SSR room to answer. Without
// it a miss only skips, and every skipped spec on an empty stack pays the wait.
const WAIT_MS = REQUIRE_SEED ? 15_000 : 5_000

// Waits for `locator` rather than probing it once: right after a navigation it
// may simply not have rendered yet.
export async function requireSeeded(locator: Locator, what: string) {
  const present = await locator
    .waitFor({ state: 'visible', timeout: WAIT_MS })
    .then(() => true, () => false)
  if (present) return
  if (REQUIRE_SEED) {
    expect(present, `${what} - E2E_REQUIRE_SEED=1 expects a seeded stack`).toBe(true)
  }
  test.skip(true, `${what} - run with a seeded stack to verify fully`)
}
