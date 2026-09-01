import { test, expect } from '@playwright/test'

test('search result links to a card detail page', async ({ page }) => {
  await page.goto('/search?q=harry')
  const firstTile = page.getByRole('figure').first()
  if (!(await firstTile.isVisible().catch(() => false))) {
    test.skip(true, 'Search index has no data — run with a seeded stack to verify fully')
  }
  await firstTile.locator('..').click() // the tile is wrapped in a link
  await expect(page).toHaveURL(/\/card\//)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('sets index links to a set page', async ({ page }) => {
  await page.goto('/sets')
  // Scope to actual set links: the first text-bearing link on the page is the
  // header's own "Sets" nav item, and clicking that never leaves /sets.
  const firstSet = page.locator('a[href*="/sets/"]').first()
  if (!(await firstSet.isVisible().catch(() => false))) {
    test.skip(true, 'DB not seeded — run with a seeded stack to verify fully')
  }
  await firstSet.click()
  await expect(page).toHaveURL(/\/sets\/[A-Z0-9]+/)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
