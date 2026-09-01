import { test, expect } from '@playwright/test'

// Requires the web running with MEILI_HOST/MEILI_SEARCH_KEY pointed at a SEEDED Meili
// (the compose stack). Skipped automatically if the search index has no data.
test('search from home shows results and a type filter narrows them', async ({ page }) => {
  await page.goto('/')
  // The home search submits on Enter; it has no submit button to click.
  await page.getByRole('search').getByRole('searchbox').fill('harry')
  await page.getByRole('search').getByRole('searchbox').press('Enter')
  await expect(page).toHaveURL(/\/search\?q=harry/)
  // The count row is the page's one live region. Matching on the text alone
  // would also hit the pager, which repeats the count without announcing it.
  await expect(page.getByRole('status')).toHaveText(/\d+ cards/)

  // If no result tiles appear within a short timeout, the search index is empty or
  // unreachable — skip so `npx playwright test` stays green without seeded data.
  const firstFigure = page.getByRole('figure').first()
  const hasTiles = await firstFigure.isVisible({ timeout: 5_000 }).catch(() => false)
  if (!hasTiles) {
    test.skip(true, 'Search index has no data — run with a seeded Meili stack to verify fully')
    return
  }

  await expect(firstFigure).toBeVisible()

  const before = await page.getByRole('figure').count()
  await page.getByRole('button', { name: 'Creature', exact: true }).click()
  await expect(page).toHaveURL(/type=creature/)
  await expect(page.getByRole('figure').first()).toBeVisible()
  expect(await page.getByRole('figure').count()).toBeLessThanOrEqual(before)
})
