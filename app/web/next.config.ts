import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'
import { resolve } from 'node:path'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

// next is hoisted to app/node_modules — turbopack.root must reach that level.
// path.resolve('..') from app/web/ gives app/ where node_modules/next lives.
const nextConfig: NextConfig = {
  turbopack: { root: resolve('..') },
}

export default withNextIntl(nextConfig)
