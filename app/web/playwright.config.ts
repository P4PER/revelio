import { defineConfig } from '@playwright/test'

// Note: `next dev` (Turbopack) has a known issue in Next.js 16 where
// middleware rewrites to dynamic segments don't resolve for the root path.
// We use the production server to get correct as-needed locale routing.
// Run `npm run build` once before `npx playwright test`.
export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: { baseURL: 'http://localhost:3000' },
})
