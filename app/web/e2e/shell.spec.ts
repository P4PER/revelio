import { test, expect } from '@playwright/test'

// The brand is the site header's wordmark, not a heading: the one h1 on the
// home page names what the page is for. The disclaimer regexes stop before
// "non-commercial" so a reworded middle does not fail them again.
test('/ shows the English heading and disclaimer', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Harry Potter TCG card search/i)
  await expect(page.getByText(/is an unofficial,/i)).toBeVisible()
})

test('/de shows the German disclaimer', async ({ page }) => {
  await page.goto('/de')
  await expect(page.getByText(/ist ein inoffizielles,/i)).toBeVisible()
})

test('/en redirects to /', async ({ page }) => {
  await page.goto('/en')
  await expect(page).toHaveURL(/\/$/)
})
