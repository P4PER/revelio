import 'server-only'
import { unstable_cache } from 'next/cache'
import { getSiteSettings, type SiteSettings } from '@revelio/db'
import { getDb } from '@/lib/db'

export const SITE_SETTINGS_TAG = 'site-settings'

/** Uncached read — use directly where freshness matters (the admin edit form). */
export async function loadSiteSettings(): Promise<SiteSettings | null> {
  return getSiteSettings(getDb())
}

/**
 * Cached read for render paths (footer, legal pages, OTP email). Hits the DB only
 * on a cache miss; the admin save action busts it via `updateTag(SITE_SETTINGS_TAG)`.
 */
export const getCachedSiteSettings = unstable_cache(loadSiteSettings, ['site-settings'], {
  tags: [SITE_SETTINGS_TAG],
})
