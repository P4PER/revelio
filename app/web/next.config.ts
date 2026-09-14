import type { NextConfig } from 'next'
import createMDX from '@next/mdx'
import createNextIntlPlugin from 'next-intl/plugin'
import { resolve } from 'node:path'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')
// No 'mdx' in pageExtensions on purpose: content lives in web/content/docs/,
// outside the App Router tree, and is reached by explicit import. Registering
// the extension would change module resolution for every route, and a stray
// .mdx under src/app/ would become routing surface. The app tree stays TSX-only.
const withMDX = createMDX({})

// next is hoisted to app/node_modules — turbopack.root must reach that level.
// path.resolve('..') from app/web/ gives app/ where node_modules/next lives.
const nextConfig: NextConfig = {
  // Standalone bundles the server + traced deps for a lean Docker image.
  // outputFileTracingRoot must reach the app/ workspace root so tracing
  // picks up the hoisted node_modules and the raw-TS workspace packages.
  output: 'standalone',
  outputFileTracingRoot: resolve('..'),
  turbopack: { root: resolve('..') },
  // Card assets are pre-sized, pre-compressed WebP variants produced at ingest
  // (full / thumb / art-crop). Next's optimizer would re-fetch and re-encode
  // WebP->WebP for ~zero byte savings, and its server-side fetch of the public
  // image host is unreachable from inside the container (hairpin NAT ->
  // ETIMEDOUT). So skip optimization: the browser loads the variants directly.
  images: { unoptimized: true },
  // next build type-checks every file in tsconfig.json's include, which covers
  // the __tests__ trees (Next 16.3 widened this from the app graph alone). Those
  // files are checked by vitest at runtime, not tsc, so point the build at the
  // same app-only scope the typecheck script uses.
  typescript: { tsconfigPath: './tsconfig.typecheck.json' },
  // Our workspace packages ship raw TypeScript (main -> src/*.ts); Next must transpile them.
  transpilePackages: ['@revelio/core', '@revelio/search', '@revelio/db'],
}

export default withNextIntl(withMDX(nextConfig))
