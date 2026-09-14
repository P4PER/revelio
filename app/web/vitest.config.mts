// .mts, not .ts: web/package.json has no "type": "module", so Vite bundles a
// .ts config to CJS, and the remark/rehype chain this config imports is ESM-only
// ("ESM file cannot be loaded by `require`"). The .mts extension makes it ESM.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import mdx from '@mdx-js/rollup'
import rehypeSlug from 'rehype-slug'
import remarkToc from './mdx/remark-toc.mjs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export default defineConfig({
  plugins: [
    // Same remark/rehype pair as next.config.ts, so a test asserts what the
    // build actually produces rather than a second, drifting pipeline.
    mdx({ remarkPlugins: [remarkToc], rehypePlugins: [rehypeSlug] }),
    react(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // next-intl's ESM build imports 'next/navigation' without .js; resolve it via
      // Node's resolution so it survives hoisting/dedupe changes.
      'next/navigation': require.resolve('next/navigation'),
      // server-only throws in non-Next.js environments (vitest/jsdom); stub it out.
      'server-only': fileURLToPath(new URL('./vitest-stubs/empty.ts', import.meta.url)),
      // next/font/google is an SWC build-time transform, not a runtime function;
      // stub it so components importing fonts can be tested.
      'next/font/google': fileURLToPath(new URL('./vitest-stubs/next-font-google.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // mdx/ and i18n/ both sit beside src/ because next.config.ts imports them
    // at build time, so their tests need collecting too.
    include: ['src/**/*.test.{ts,tsx}', 'i18n/**/*.test.ts', 'mdx/**/*.test.ts'],
    // Inline next-intl so Vite's alias resolution applies inside node_modules
    server: { deps: { inline: ['next-intl', 'use-intl'] } },
  },
})
