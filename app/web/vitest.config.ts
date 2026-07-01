import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // next-intl's ESM build imports 'next/navigation' without .js; resolve it via
      // Node's resolution so it survives hoisting/dedupe changes.
      'next/navigation': require.resolve('next/navigation'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Inline next-intl so Vite's alias resolution applies inside node_modules
    server: { deps: { inline: ['next-intl', 'use-intl'] } },
  },
})
