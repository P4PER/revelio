/**
 * Canonical public origin — single source of truth for absolute URLs
 * (sitemap, robots, canonical/OG tags, email links). Any trailing slash is
 * stripped so `${SITE_URL}${path}` can never produce a double slash even if
 * NEXT_PUBLIC_BASE_URL is misconfigured with one.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_BASE_URL ?? 'https://revelio.cards').replace(/\/+$/, '')
