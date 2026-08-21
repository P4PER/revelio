import 'server-only'
import type { MeiliSearch } from 'meilisearch'
import { createMeiliClient } from '@revelio/search'

// A Meilisearch client authenticated with the SCOPED write key (documents.add
// /update on the card indexes only) — never the master key, never sent to the
// browser (no NEXT_PUBLIC_ prefix).
export function getWriteClient(): MeiliSearch {
  const host = process.env.MEILI_HOST
  if (!host) throw new Error('MEILI_HOST is required')
  const key = process.env.MEILI_WRITE_KEY
  if (!key) throw new Error('MEILI_WRITE_KEY is required')
  return createMeiliClient(host, key)
}
