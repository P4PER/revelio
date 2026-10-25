import { test, expect } from '@playwright/test'

// PNG magic number — the first 8 bytes of every PNG file.
const PNG_SIGNATURE = '89504e470d0a1a0a'

// og:image is absolute and built from the configured site URL, which is not
// the host under test. Strip it back to a path so the request goes to the
// server this run actually started.
function servedPath(absolute: string) {
  const url = new URL(absolute)
  return url.pathname + url.search
}

// A legal page needs no seeded data, so it renders (and exposes the inherited
// default OG image) even against an empty stack.
test('the default Open Graph image renders as a real PNG', async ({ page, request }) => {
  await page.goto('/privacy')
  const ogUrl = await page.locator('meta[property="og:image"]').getAttribute('content')
  expect(ogUrl, 'og:image meta tag is present').toBeTruthy()

  const res = await request.get(servedPath(ogUrl!))
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('image/png')

  const body = await res.body()
  expect(body.byteLength).toBeGreaterThan(1000)
  expect(body.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE)
})

test('a public deck OG image renders as a real PNG when decks exist', async ({ page, request }) => {
  await page.goto('/decks')
  // Scope to actual deck-detail cards — exclude the nav's /decks/new and
  // /decks/mine links, which would otherwise navigate off the deck OG route.
  const firstDeck = page
    .locator('a[href*="/decks/"]:not([href$="/new"]):not([href$="/mine"])')
    .first()
  // A plain skip, outside E2E_REQUIRE_SEED: ingest seeds cards and sets but no
  // decks, so a seeded stack has none until someone publishes one. Waited for
  // rather than probed, so a slow render does not pass for an empty list.
  const hasDeck = await firstDeck
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true, () => false)
  if (!hasDeck) {
    test.skip(true, 'No public decks - publish a deck to verify the deck OG route')
  }
  await firstDeck.click()
  // A deck detail URL ends in a UUID — proves we exercised the deck OG route.
  await expect(page).toHaveURL(/\/decks\/[0-9a-f-]{36}/)

  const ogUrl = await page.locator('meta[property="og:image"]').getAttribute('content')
  expect(ogUrl, 'deck og:image is present').toBeTruthy()

  const res = await request.get(servedPath(ogUrl!))
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toContain('image/png')
  const body = await res.body()
  expect(body.subarray(0, 8).toString('hex')).toBe(PNG_SIGNATURE)
})

test('the app emits an apple-touch-icon and a served web manifest', async ({ page, request }) => {
  await page.goto('/privacy')

  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1)

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(manifestHref, 'manifest link is present').toBeTruthy()

  const res = await request.get(manifestHref!)
  expect(res.status()).toBe(200)
  const manifest = await res.json()
  expect(manifest.name).toBe('Revelio')
  expect((manifest.icons ?? []).length).toBeGreaterThan(0)
})
