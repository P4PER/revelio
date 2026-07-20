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
      // server-only throws in non-Next.js environments (vitest/jsdom); stub it out.
      'server-only': fileURLToPath(new URL('./test/empty.ts', import.meta.url)),
      // next/font/google is an SWC build-time transform, not a runtime function;
      // stub it so components importing fonts can be tested.
      'next/font/google': fileURLToPath(new URL('./test/next-font-google.ts', import.meta.url)),
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
