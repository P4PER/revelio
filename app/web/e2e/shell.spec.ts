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

// The deck builder sizes its mobile app shell as 100dvh minus --header-h, so
// that constant has to keep matching the header it describes. Nothing enforces
// that in CSS, and getting it wrong leaves either a gap above the footer or a
// pane taller than the screen - so assert the relationship here, where the
// header is actually laid out.
test('the --header-h constant matches the rendered site header', async ({ page }) => {
  await page.goto('/')
  const { headerPx, varPx } = await page.evaluate(() => {
    const header = document.querySelector('header')!
    const probe = document.createElement('div')
    probe.style.height = 'var(--header-h)'
    probe.style.position = 'absolute'
    document.body.append(probe)
    const varPx = probe.offsetHeight
    probe.remove()
    return { headerPx: header.offsetHeight, varPx }
  })
  expect(varPx).toBeGreaterThan(0)
  expect(headerPx).toBe(varPx)
})
