import { test, expect } from '@playwright/test'

const PARCHMENT = 'rgb(248, 245, 237)' // #F8F5ED
const MIDNIGHT = 'rgb(19, 18, 42)' // #13122A

// Serialized into the page by page.evaluate, so the browser globals are fine.
const pageBackground = () => getComputedStyle(document.body).backgroundColor

test.describe('theme', () => {
  test('follows the OS setting when no choice is stored', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/en')
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)
    expect(await page.evaluate(pageBackground)).toBe(PARCHMENT)

    await page.emulateMedia({ colorScheme: 'dark' })
    expect(await page.evaluate(pageBackground)).toBe(MIDNIGHT)
  })

  test('an explicit choice beats the OS setting', async ({ page, context }) => {
    await context.addCookies([
      { name: 'revelio.theme', value: 'light', url: 'http://localhost:3000' },
    ])
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/en')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(pageBackground)).toBe(PARCHMENT)
  })

  // Picking a theme lives behind the auth gate like every other settings route;
  // the form itself is covered by src/components/settings/__tests__/appearance-form.test.tsx.
  test('the appearance page sends a signed-out visitor to login', async ({ page }) => {
    await page.goto('/en/settings/appearance')
    await expect(page).toHaveURL(/\/login/)
  })
})
