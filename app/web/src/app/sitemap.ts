import type { MetadataRoute } from 'next'
import { listCardsForSitemap, listSetsForSitemap } from '@revelio/db'
import { getDb } from '@/lib/db'
import { buildSitemap } from '@/lib/sitemap'

// The card catalog changes only via editor writes, so a per-request query is
// cheap and always fresh; force-dynamic avoids caching a stale snapshot.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const db = getDb()
  const [cards, sets] = await Promise.all([listCardsForSitemap(db), listSetsForSitemap(db)])
  return buildSitemap({ cards, sets })
}
