import { test, expect } from '@playwright/test'
import { total } from './result-total'
import { requireSeeded } from './seeded'

// Requires the web running with MEILI_HOST/MEILI_SEARCH_KEY pointed at a SEEDED Meili
// (the compose stack). Skipped if the search index has no data, unless
// E2E_REQUIRE_SEED=1 (see seeded.ts).
test('search from home shows results and a type filter narrows them', async ({ page }) => {
  await page.goto('/')
  // The home search submits on Enter; it has no submit button to click.
  await page.getByRole('search').getByRole('searchbox').fill('harry')
  await page.getByRole('search').getByRole('searchbox').press('Enter')
  await expect(page).toHaveURL(/\/search\?q=harry/)
  // The count row is the page's one live region. Matching on the text alone
  // would also hit the pager, which repeats the count without announcing it.
  await expect(page.getByRole('status')).toHaveText(/\d+ cards/)

  const firstFigure = page.getByRole('figure').first()
  await requireSeeded(firstFigure, 'Search index has no data')

  // Compared on the total, not the tiles: both pages fill a full grid, so a
  // tile count stays at the page size whether or not the filter applied.
  const before = await total(page)
  await page.getByRole('button', { name: 'Creature', exact: true }).click()
  await expect(page).toHaveURL(/type=creature/)
  await expect(page.getByRole('figure').first()).toBeVisible()
  await expect.poll(() => total(page)).toBeLessThan(before)
})
