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
// Measured on /decks/new, and at phone width as well as desktop: that is the
// page whose layout depends on the constant, and its header is composed
// differently from the home page's - off home the wordmark drops to the square
// icon below 640px and the h-8 header search shares the row. getBoundingClientRect
// rather than offsetHeight, which rounds both sides to whole pixels and would let
// sub-pixel drift through.
for (const width of [402, 1440]) {
  test(`the --header-h constant matches the rendered site header at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/decks/new')
    const { headerPx, varPx } = await page.evaluate(() => {
      const header = document.querySelector('header')!
      const probe = document.createElement('div')
      probe.style.height = 'var(--header-h)'
      probe.style.position = 'absolute'
      document.body.append(probe)
      const varPx = probe.getBoundingClientRect().height
      probe.remove()
      return { headerPx: header.getBoundingClientRect().height, varPx }
    })
    expect(varPx).toBeGreaterThan(0)
    expect(headerPx).toBeCloseTo(varPx, 1)
  })
}
