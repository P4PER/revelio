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

// Which is the other half of the same decision. Anchoring the sheet to the
// workbench is what keeps that band honest, but it also means a page free to
// scroll while the sheet is open would carry the sheet up the screen with it.
// So the page holds still while the sheet is open, and scrolls to the footer
// once it is shut.
test('the phone page holds still while the deck sheet is open, and scrolls once it is shut', async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 })
  await page.goto('/decks/new')

  // A wheel, not window.scrollTo: `overflow: hidden` stops a user scrolling a
  // box, never a script, so a programmatic scroll would report the page moving
  // whether the lock was there or not.
  //
  // Over the header, which is the page. Almost everything below it is the
  // workbench, and the card grid there is its own scroll container - a wheel
  // over the cards scrolls the grid and tells us nothing about the page.
  const wheelDown = async () => {
    await page.mouse.move(200, 25)
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(150)
    return page.evaluate(() => window.scrollY)
  }

  // Shut: the footer is reachable like on any other page.
  expect(await wheelDown()).toBeGreaterThan(0)

  await page.evaluate(() => window.scrollTo(0, 0))
  await page.click('[data-deck-sheet] button')
  await expect(page.locator('[data-deck-sheet] button').first()).toHaveAttribute(
    'aria-expanded',
    'true',
  )

  // Open: it does not.
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).toBe(
    'hidden',
  )
  expect(await wheelDown()).toBe(0)

  // Shut again, and the page is free again - the lock leaves nothing behind.
  await page.click('[data-deck-sheet] button')
  await expect(page.locator('[data-deck-sheet] button').first()).toHaveAttribute(
    'aria-expanded',
    'false',
  )
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflow)).not.toBe(
    'hidden',
  )
  expect(await wheelDown()).toBeGreaterThan(0)
})

// From md up the sheet is display:contents and the deck is a column of the
// workbench, so there is no open state to lock the page for.
test('the desktop workbench never locks the page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/decks/new')

  await page.evaluate(() => window.scrollTo(0, 200))
  expect(await page.evaluate(() => window.scrollY)).toBe(200)
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe('')
})
