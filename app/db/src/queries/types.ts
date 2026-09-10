import type { DB } from '../client'

// The transaction handle drizzle passes into `db.transaction(async (tx) => ...)`.
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0]

// Minimal row for the XML sitemap: id/code + last-modified for <lastmod>.
export type SitemapEntry = { id: string; updatedAt: Date }
