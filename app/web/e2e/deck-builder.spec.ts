import { test, expect } from '@playwright/test'

// The phone builder is an app shell: the browse pane reserves a band at its
// foot for the strip of deck sheet that peeks over it. That reservation is
// padding on an element in the page flow, so it only lines up with the sheet
// while the two are measured in the same coordinate system. The sheet used to
// be fixed to the viewport, and the builder page scrolls - the footer sits
// below the fold - so every pixel of page scroll pushed the sheet a pixel
// further from the band meant for it, and the gap under the last card row grew
// as you scrolled. Assert the band and the sheet stay together at any offset.
test('the browse pane keeps its reserved band under the deck sheet while the page scrolls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 })
  await page.goto('/decks/new')

  const measure = () =>
    page.evaluate(() => {
      const pane = document.querySelector('[data-pane="browse"]')!
      const handle = document.querySelector('[data-deck-sheet] button')!
      const reserved = parseFloat(getComputedStyle(pane).paddingBottom)
      const paneContentBottom = pane.getBoundingClientRect().bottom - reserved
      return {
        scrollY: window.scrollY,
        reserved,
        gap: handle.getBoundingClientRect().top - paneContentBottom,
      }
    })

  const atTop = await measure()
  expect(atTop.reserved).toBeGreaterThan(0)
  expect(atTop.gap).toBeLessThanOrEqual(1)

  await page.evaluate(() => window.scrollTo(0, 300))
  const scrolled = await measure()
  // Guards the assertion below: a page that cannot scroll would pass it for
  // the wrong reason.
  expect(scrolled.scrollY).toBe(300)
  expect(scrolled.gap).toBeCloseTo(atTop.gap, 0)
})
