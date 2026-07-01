import { test, expect } from '@playwright/test'

test('/ shows the English brand heading and disclaimer', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'revelio.cards' })).toBeVisible()
  await expect(page.getByText(/unofficial fan project/i)).toBeVisible()
})

test('/de shows the German disclaimer', async ({ page }) => {
  await page.goto('/de')
  await expect(page.getByText(/inoffizielles Fan-Projekt/i)).toBeVisible()
})

test('/en redirects to /', async ({ page }) => {
  await page.goto('/en')
  await expect(page).toHaveURL(/\/$/)
})
