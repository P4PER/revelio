import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// robots.txt is world-readable and is NOT an access control, so it deliberately
// does not enumerate admin/auth/editor routes — that would only advertise them.
// Private pages are kept out of search with per-page `noindex` metadata instead
// (admin layout, login, register); auth-gated routes already 404/redirect for
// outsiders. Only the non-indexable API surface is disallowed here.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/api/',
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
