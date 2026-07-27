import type { MetadataRoute } from 'next'
import type { SitemapEntry } from '@revelio/db'
import { routing } from '@/../i18n/routing'
import { getPathname } from '@/../i18n/navigation'
import { SITE_URL } from '@/lib/site'

type Entry = MetadataRoute.Sitemap[number]

function absUrl(href: string, locale: string): string {
  // getPathname applies the as-needed locale prefix (en: /card/x, de: /de/card/x).
  return `${SITE_URL}${getPathname({ href, locale })}`
}

// One <url> per (page × locale). Each carries the full hreflang alternates map
// — including x-default — so every language version references all the others,
// as Google's sitemap hreflang spec requires. Only <lastmod> is emitted beyond
// that: Google ignores <priority>/<changefreq>, so we don't fabricate them.
export function localizedEntries(href: string, lastModified?: Entry['lastModified']): MetadataRoute.Sitemap {
  const languages: Record<string, string> = Object.fromEntries(
    routing.locales.map((l) => [l, absUrl(href, l)]),
  )
  languages['x-default'] = absUrl(href, routing.defaultLocale)
  return routing.locales.map((locale) => ({
    url: absUrl(href, locale),
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages },
  }))
}

// Indexable, query-free content routes. Auth, admin, editor, and user-specific
// pages (login/register/collection/decks-mine) are deliberately absent here and
// carry `noindex` on the pages themselves — robots.txt no longer enumerates them.
export const STATIC_ROUTES = [
  '/',
  '/search',
  '/sets',
  '/decks',
  '/about',
  '/contact',
  '/imprint',
  '/privacy',
]

export function buildSitemap(data: { cards: SitemapEntry[]; sets: SitemapEntry[] }): MetadataRoute.Sitemap {
  return [
    ...STATIC_ROUTES.flatMap((href) => localizedEntries(href)),
    ...data.sets.flatMap((s) => localizedEntries(`/sets/${s.id}`, s.updatedAt)),
    ...data.cards.flatMap((c) => localizedEntries(`/card/${c.id}`, c.updatedAt)),
  ]
}
