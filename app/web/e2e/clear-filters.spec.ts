import { test, expect } from '@playwright/test'

// The shared "Clear filters" control mounts into rows that, on the deck
// builder and the collection's Browse tab, hold nothing but the result count.
// A control with a fixed button box would set those rows' height, so applying
// a filter would grow the row and shove the card grid below it down. Those two
// pages need a session, so this measures the same control on /decks, which is
// public and renders it from the same component.
test('applying a filter does not resize the result-count row', async ({ page }) => {
  await page.goto('/decks')

  // The count row is the first live region on the page. An empty result set
  // renders a second one (the empty state), so this must not be positional.
  const row = page.locator('[role="status"]').first().locator('..')
  const before = await row.evaluate((n: HTMLElement) => n.offsetHeight)

  await page.getByRole('button', { name: 'Charms', exact: true }).click()
  // The empty state offers its own Clear filters button; measure the one in
  // the count row, which is the control this test is about.
  const clear = page.getByRole('button', { name: /clear filters/i }).first()
  await expect(clear).toBeVisible()

  expect(await row.evaluate((n: HTMLElement) => n.offsetHeight)).toBe(before)

  // The control overflows its line box on purpose so the pointer target clears
  // the 24px minimum while the row stays the height of the count beside it.
  const target = await clear.evaluate((n: HTMLElement) => n.getBoundingClientRect().height)
  expect(target).toBeGreaterThanOrEqual(24)
})
