import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { resolve } from 'node:path'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

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
  // Our workspace packages ship raw TypeScript (main -> src/*.ts); Next must transpile them.
  transpilePackages: ['@revelio/core', '@revelio/search', '@revelio/db'],
}

export default withNextIntl(nextConfig)
