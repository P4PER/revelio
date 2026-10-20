import { test, expect, type Page } from '@playwright/test'

// 1488x1200 is the window the peeking slash menu was first seen on: there the
// hero's content alone ended about 60px above the menu window's top edge.
const VIEWPORTS = [
  { width: 1488, height: 1200 },
  { width: 2560, height: 1440 },
  { width: 390, height: 844 },
]

// How far under the site header the hero's topmost content starts. Only
// in-flow children count: a decoration positioned out of flow says nothing
// about where the padding and track alignment put the content.
async function heroContentOffset(page: Page) {
  const header = await page.locator('header').first().boundingBox()
  const top = await page.getByTestId('hero').evaluate((hero) =>
    Math.min(
      ...[...hero.children]
        .filter((c) => !['absolute', 'fixed'].includes(getComputedStyle(c).position))
        .map((c) => c.getBoundingClientRect().top),
    ),
  )
  return top - header!.y - header!.height
}

// The space between the stacked hero's text column and its channel mock.
async function stackedGap(page: Page) {
  const copy = await page.getByTestId('hero-copy').boundingBox()
  const mock = await page.getByTestId('command-channel').boundingBox()
  return mock!.y - (copy!.y + copy!.height)
}

// The hero takes a whole viewport so the commands section's slash menu never
// peeks in under it on the first screen. jsdom cannot lay that out, so it is
// measured here.
for (const viewport of VIEWPORTS) {
  test(`/discord keeps the commands section below the fold at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/discord')
    const top = await page.locator('#commands').evaluate((el) => el.getBoundingClientRect().top)
    expect(top).toBeGreaterThanOrEqual(viewport.height)
  })
}

// The min-height's extra space goes below the hero, not above it, so the
// hero's content starts as far under the header as /about's does.
for (const viewport of VIEWPORTS) {
  test(`/discord starts its hero as far under the header as /about at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto('/about')
    const about = await heroContentOffset(page)
    await page.goto('/discord')
    expect(await heroContentOffset(page)).toBeCloseTo(about, 0)
  })
}

// Stacked below md, the hero's two grid rows would share out the extra height
// a tall, narrow window gives the min-height, opening a band between the CTAs
// and the channel mock; the tracks stay packed at the grid's gap-10 instead.
test('/discord keeps the stacked hero packed on a tall narrow window', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 1500 })
  await page.goto('/discord')
  expect(await stackedGap(page)).toBeCloseTo(40, 0)
})
