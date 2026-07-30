import { test, expect } from '@playwright/test'

// The project has no reusable e2e sign-in helper (all other specs are
// unauthenticated), so the signed-in settings flow is verified manually — see
// the manual checklist in docs/superpowers/plans/2026-07-30-user-settings-page.md.
// This spec covers the auth gate, which needs no session.

test('settings redirects a logged-out visitor to login', async ({ page }) => {
  await page.goto('/settings')
  await expect(page).toHaveURL(/\/login/)
})

test('German settings redirects a logged-out visitor to login', async ({ page }) => {
  await page.goto('/de/settings')
  await expect(page).toHaveURL(/\/login/)
})
