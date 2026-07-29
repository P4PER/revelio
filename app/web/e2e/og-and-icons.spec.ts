import { test, expect } from '@playwright/test'

// PNG magic number — the first 8 bytes of every PNG file.
const PNG_SIGNATURE = '89504e470d0a1a0a'

// A legal page needs no seeded data, so it renders (and exposes the inherited
// default OG image) even against an empty stack.
test('the default Open Graph image renders as a real PNG', async ({ page, request }) => {
  await page.goto('/about')
  const ogUrl = await page.locator('meta[property="og:image"]').getAttribute('content')
  expect(ogUrl, 'og:image meta tag is present').toBeTruthy()

  const res = await request.get(ogUrl!)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('image/png')

  const body = await res.body()
  expect(body.byteLength).toBeGreaterThan(1000)
  expect(body.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE)
})

test('the app emits an apple-touch-icon and a served web manifest', async ({ page, request }) => {
  await page.goto('/about')

  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1)

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref, 'manifest link is present').toBeTruthy()

  const res = await request.get(manifestHref!)
  expect(res.status()).toBe(200)
  const manifest = await res.json()
  expect(manifest.name).toBe('Revelio')
  expect((manifest.icons ?? []).length).toBeGreaterThan(0)
})
