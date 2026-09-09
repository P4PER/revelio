import { test, expect } from '@playwright/test'

// The phone builder is an app surface: the workbench is exactly the viewport
// less the header, the card grid scrolls inside itself, and the deck sheet
// peeks over the band the browse pane reserves at its foot. That reservation
// is padding on an element in the page flow, so it only lines up with the
// sheet while neither of them can move relative to the other.
//
// The site footer sits below the fold on every page, which left this one a
// screenful of scroll it had no use for - and scrolling it dragged the surface
// up, stranding the sheet in the middle of the screen with the footer beneath
// and the grid cut off behind it. So below md the page drops the footer and
// stands exactly one viewport tall. Assert that, and that the sheet sits at
// its foot with the reserved band right under the last card row.
test('the phone builder is one viewport tall, with the deck sheet pinned to its foot', async ({
  page,
}) => {
  await page.setViewportSize({ width: 402, height: 874 })
  await page.goto('/decks/new')

  const measured = await page.evaluate(() => {
    const pane = document.querySelector('[data-pane="browse"]')!
    const handle = document.querySelector('[data-deck-sheet] button')!
    const footer = document.querySelector('body > footer')
    const reserved = parseFloat(getComputedStyle(pane).paddingBottom)
    return {
      maxScroll: document.documentElement.scrollHeight - window.innerHeight,
      footerShown: footer ? getComputedStyle(footer).display !== 'none' : false,
      reserved,
      // The workbench has to end on the bottom edge of the screen, not above
      // it. The sheet itself hangs below that edge by design - all but its
      // peek is off-screen while it is shut - so the pane is what says whether
      // the surface is measured against the right box.
      paneBottomOffset: window.innerHeight - pane.getBoundingClientRect().bottom,
      gap: handle.getBoundingClientRect().top - (pane.getBoundingClientRect().bottom - reserved),
    }
  })

  expect(measured.maxScroll).toBe(0)
  expect(measured.footerShown).toBe(false)
  expect(measured.reserved).toBeGreaterThan(0)
  expect(measured.paneBottomOffset).toBeCloseTo(0, 0)
  expect(measured.gap).toBeLessThanOrEqual(1)
})

// The expanded sheet wants 85dvh, but it is the workbench box that clips it
// and that box is a header shorter than the screen. Held sideways there are
// not 85 spare dvh, and the box would cut the grabber and the rounded corners
// off the top - so the height is capped at its own container.
test('the expanded sheet stays inside the workbench on a phone held sideways', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 331 })
  await page.goto('/decks/new')

  await page.click('[data-deck-sheet] button')
  const box = await page.evaluate(() => {
    const rect = document.querySelector('[data-deck-sheet]')!.getBoundingClientRect()
    const headerH = document.querySelector('header')!.getBoundingClientRect().height
    return { top: rect.top, headerH, vh: window.innerHeight }
  })

  // Its top clears the header rather than disappearing behind it.
  expect(box.top).toBeGreaterThanOrEqual(box.headerH - 1)
})

// The workbench is only an app surface where it is the whole screen. From md
// up it is a card on a page, the sheet is part of the grid rather than a sheet
// at all, and the footer belongs below it like anywhere else.
test('the desktop workbench keeps the site footer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/decks/new')

  const footer = page.locator('body > footer')
  await expect(footer).toBeVisible()
})
