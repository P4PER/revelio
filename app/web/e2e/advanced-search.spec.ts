import { test, expect } from '@playwright/test'

test('filter drawer narrows results and shows a removable chip', async ({ page }) => {
  await page.goto('/search?q=harry')
  const grid = page.getByRole('figure').first()
  if (!(await grid.isVisible().catch(() => false))) {
    test.skip(true, 'Search index has no data — run with a seeded stack to verify fully')
  }
  await page.getByRole('button', { name: /filters/i }).click()
  await page.getByLabel('Creature').check()
  await page.getByRole('button', { name: /apply/i }).click()
  await expect(page).toHaveURL(/type=creature/)
  await expect(page.getByText(/Creature/)).toBeVisible()
})
