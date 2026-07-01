import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // next-intl's ESM build imports 'next/navigation' without .js; resolve it here.
      // next is hoisted to app/node_modules, one level above app/web.
      'next/navigation': fileURLToPath(
        new URL('../node_modules/next/navigation.js', import.meta.url),
      ),
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
