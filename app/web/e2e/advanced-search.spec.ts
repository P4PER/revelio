import { test, expect, type Page } from '@playwright/test'

// The trailing figure of the count row -- "1-24 of 100 cards" -> 100. Read as a
// number so "narrows" is an actual comparison rather than two strings differing.
async function total(page: Page) {
  const text = await page.getByRole('status').textContent()
  const match = text?.match(/([\d,.\u202f\u00a0]+)\s+\S+$/)
  expect(match, `count row should end in a total, got ${text}`).toBeTruthy()
  return Number(match![1].replace(/\D/g, ''))
}

test('filter drawer narrows results and shows a removable chip', async ({ page }) => {
  await page.goto('/search?q=harry')
  const grid = page.getByRole('figure').first()
  if (!(await grid.isVisible().catch(() => false))) {
    test.skip(true, 'Search index has no data — run with a seeded stack to verify fully')
  }
  const before = await total(page)

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
  expect(await total(page)).toBeLessThan(before)
  await expect(page.getByRole('button', { name: 'remove Rare' })).toBeVisible()
})
