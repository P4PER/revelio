import { expect, type Page } from '@playwright/test'

// The trailing figure of the count row -- "1-24 of 100 cards" -> 100. Read as a
// number so "narrows" is an actual comparison rather than two strings differing.
export async function total(page: Page) {
  const text = await page.getByRole('status').textContent()
  const match = text?.match(/([\d,.\u202f\u00a0]+)\s+\S+$/)
  expect(match, `count row should end in a total, got ${text}`).toBeTruthy()
  return Number(match![1].replace(/\D/g, ''))
}
