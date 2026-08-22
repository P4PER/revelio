import 'server-only'
import { createClient, type DB } from '@revelio/db'

let cached: DB | null = null

// One pooled client per server process (avoids a new connection per request).
export function getDb(): DB {
  if (cached) return cached
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  cached = createClient(url).db
  return cached
}
