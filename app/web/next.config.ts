import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { resolve } from 'node:path'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

// Derive image remotePatterns from the public image base URL env var.
const imageBase = process.env.NEXT_PUBLIC_IMAGE_BASE_URL
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

// next is hoisted to app/node_modules — turbopack.root must reach that level.
// path.resolve('..') from app/web/ gives app/ where node_modules/next lives.
const nextConfig: NextConfig = {
  turbopack: { root: resolve('..') },
  images: { remotePatterns },
  // Our workspace packages ship raw TypeScript (main -> src/*.ts); Next must transpile them.
  transpilePackages: ['@revelio/core', '@revelio/search', '@revelio/db'],
}

export default withNextIntl(nextConfig)
