import type { Meilisearch } from 'meilisearch'
import type { DB } from '@revelio/db'
import { cardsIndex, CARD_INDEX_SETTINGS, waitForSuccess } from '@revelio/search'
import { buildDocuments } from './build-documents.js'

// How long ingest waits on each indexing task. The client's 5 s default fits one
// document, not a whole language's corpus or a settings change that re-indexes a
// populated index on a cold host; timing out there would fail the job over a
// task that goes on to succeed.
export const INDEX_TASK_TIMEOUT_MS = 5 * 60_000
// How often such a wait polls. The client polls every 50 ms by default, which over
// a 5-minute wait is 6000 task reads against a server busy indexing.
export const INDEX_TASK_INTERVAL_MS = 500

export async function indexCards(db: DB, client: Meilisearch): Promise<string[]> {
  const byLang = await buildDocuments(db)
  const langs = Object.keys(byLang)
  const wait = { timeout: INDEX_TASK_TIMEOUT_MS, interval: INDEX_TASK_INTERVAL_MS }
  for (const lang of langs) {
    const index = client.index(cardsIndex(lang))
    // updateSettings auto-creates the index if it does not exist.
    await waitForSuccess(index.updateSettings(CARD_INDEX_SETTINGS), wait)
    await waitForSuccess(index.addDocuments(byLang[lang], { primaryKey: 'id' }), wait)
  }
  return langs
}
