import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { resolve } from 'node:path'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

// Derive image remotePatterns from the public image base URL env var.
const imageBase = process.env.NEXT_PUBLIC_IMAGE_BASE_URL
const imageHost = imageBase ? new URL(imageBase).hostname : ''
const remotePatterns = imageBase
  ? [(() => {
      const u = new URL(imageBase)
      return {
        protocol: u.protocol.replace(':', '') as 'http' | 'https',
        hostname: u.hostname,
        port: u.port,
        pathname: '/**',
      }
    })()]
  : []

// Next's image optimizer refuses to fetch upstreams that resolve to a private/
// loopback IP (SSRF protection). In dev the images sit on localhost MinIO, so
// skip optimization there — the browser loads MinIO directly. In prod the base
// is a real CDN host and optimization stays on.
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const imageHostIsLoopback = LOOPBACK.has(imageHost)

// next is hoisted to app/node_modules — turbopack.root must reach that level.
// path.resolve('..') from app/web/ gives app/ where node_modules/next lives.
const nextConfig: NextConfig = {
  // Standalone bundles the server + traced deps for a lean Docker image.
  // outputFileTracingRoot must reach the app/ workspace root so tracing
  // picks up the hoisted node_modules and the raw-TS workspace packages.
  output: 'standalone',
  outputFileTracingRoot: resolve('..'),
  turbopack: { root: resolve('..') },
  images: { remotePatterns, unoptimized: imageHostIsLoopback },
  // Our workspace packages ship raw TypeScript (main -> src/*.ts); Next must transpile them.
  transpilePackages: ['@revelio/core', '@revelio/search', '@revelio/db'],
}

export default withNextIntl(nextConfig)
