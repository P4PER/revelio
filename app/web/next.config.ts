import type { NextConfig } from 'next'
import createMDX from '@next/mdx'
import createNextIntlPlugin from 'next-intl/plugin'
import { resolve } from 'node:path'

const withNextIntl = createNextIntlPlugin('./i18n/request.ts')
// No 'mdx' in pageExtensions on purpose: content lives in web/content/docs/,
// outside the App Router tree, and is reached by explicit import. Registering
// the extension would change module resolution for every route, and a stray
// .mdx under src/app/ would become routing surface. The app tree stays TSX-only.
// remarkToc injects `export const toc`; rehypeSlug puts the matching ids on the
// rendered headings. They must stay paired - the ids the rail links to are the
// ones rehype-slug writes.
//
// Plugins are named by module path, not imported and passed by reference:
// Turbopack serializes loader options to pass them across threads, and a
// function is not serializable ("does not have serializable options"). It
// resolves each string itself. vitest.config.mts imports remark-toc.mjs
// directly, since Vite has no such constraint.
//
// The local plugin needs an absolute path: @next/mdx resolves these with
// require.resolve(path, { paths: [projectRoot] }), and Node ignores `paths`
// for a relative specifier, resolving it against node_modules/@next/mdx
// instead. Same cwd assumption as turbopack.root above - next runs in web/.
const withMDX = createMDX({
  options: {
    remarkPlugins: [[resolve('./mdx/remark-toc.mjs'), {}]],
    rehypePlugins: [['rehype-slug', {}]],
  },
})

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
