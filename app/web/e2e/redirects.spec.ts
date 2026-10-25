import { test, expect } from '@playwright/test'
import { routing } from '../i18n/routing'

// /about was indexed and linked before the page was removed; every locale
// answers with a permanent redirect rather than a 404.
const CASES = [
  ['/about', '/'],
  ...routing.locales.map((locale) => [`/${locale}/about`, `/${locale}`]),
]

for (const [from, to] of CASES) {
  test(`${from} redirects permanently to ${to}`, async ({ request }) => {
    const res = await request.get(from, { maxRedirects: 0 })
    expect(res.status()).toBe(308)
    expect(res.headers()['location']).toBe(to)
  })
}
