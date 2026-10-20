import { test, expect, type Page } from '@playwright/test'

// The hero takes a whole viewport so the commands section's slash menu never
// peeks in under it on the first screen. jsdom cannot lay that out, so it is
// measured here. 1488x1200 is the window it was first seen on: there the hero's
// content alone ended about 60px above the menu window's top edge.
for (const viewport of [
  { width: 1488, height: 1200 },
  { width: 2560, height: 1440 },
  { width: 390, height: 844 },
]) {
  test(`/discord keeps the commands section below the fold at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/discord')
    const top = await page.locator('#commands').evaluate((el) => el.getBoundingClientRect().top)
    expect(top).toBeGreaterThanOrEqual(viewport.height)
  })
}

// Stacked below md, the hero's two grid rows would share out the extra height
// a tall, narrow window gives the min-height, opening a band between the CTAs
// and the channel mock; the tracks stay packed at the grid's gap-10 instead.
async function stackedGap(page: Page) {
  return page.getByRole('heading', { level: 1 }).evaluate((h1) => {
    const text = h1.parentElement!
    const mock = text.nextElementSibling!
    return mock.getBoundingClientRect().top - text.getBoundingClientRect().bottom
  })
}

test('/discord keeps the stacked hero packed on a tall narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 1500 })
  await page.goto('/discord')
  expect(await stackedGap(page)).toBeCloseTo(40, 0)
})
