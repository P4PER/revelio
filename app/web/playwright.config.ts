import { defineConfig } from '@playwright/test'

// Note: `next dev` (Turbopack) has a known issue in Next.js 16 where
// middleware rewrites to dynamic segments don't resolve for the root path.
// We use the production server to get correct as-needed locale routing.
//
// That makes the port a trap worth spelling out. `reuseExistingServer` attaches
// to whatever already answers on the port instead of starting anything, and it
// cannot tell a production server from a dev one -- so with `next dev` running,
// the whole suite silently runs against the server this config exists to avoid
// and fails for reasons that have nothing to do with the code. Set E2E_PORT to
// a free port to run a real production server alongside a dev server:
//
//   E2E_PORT=3100 npm run e2e -w web
const E2E_PORT = Number(process.env.E2E_PORT ?? 3000)

const baseURL = `http://localhost:${E2E_PORT}`

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: `npm run build && npm run start -- --port ${E2E_PORT}`,
    url: `${baseURL}/`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
  use: { baseURL },
})
