import { test, expect } from '@playwright/test'

test('filter drawer narrows results and shows a removable chip', async ({ page }) => {
  await page.goto('/search?q=harry')
  const grid = page.getByRole('figure').first()
  if (!(await grid.isVisible().catch(() => false))) {
    test.skip(true, 'Search index has no data — run with a seeded stack to verify fully')
  }
  const before = await page.getByRole('status').textContent()

  // filters.button reads "Advanced", not "Filters".
  await page.getByRole('button', { name: /advanced/i }).click()
  const sheet = page.getByRole('dialog')
  // Rarity rather than Type: ActiveFilters deliberately leaves Type and Lesson
  // to their quick-filter badges, so a type narrows the results but never
  // produces the chip this test is named for.
  await sheet.getByLabel('Rare', { exact: true }).check()
  await sheet.getByRole('button', { name: /apply/i }).click()
  await expect(page).toHaveURL(/rarity=rare/)

  // The sheet aria-hides the page behind it, so nothing on the results page is
  // reachable by role until it has finished closing.
  await sheet.waitFor({ state: 'hidden' })
  await expect(page.getByRole('status')).not.toHaveText(before ?? '')
  await expect(page.getByRole('button', { name: 'remove Rare' })).toBeVisible()
})
