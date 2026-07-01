import type { MeiliSearch } from 'meilisearch'
import type { DB } from '@revelio/db'
import { cardsIndex, CARD_INDEX_SETTINGS } from '@revelio/search'
import { buildDocuments } from './build-documents.js'

export async function indexCards(db: DB, client: MeiliSearch): Promise<string[]> {
  const byLang = await buildDocuments(db)
  const langs = Object.keys(byLang)
  for (const lang of langs) {
    const index = client.index(cardsIndex(lang))
    // updateSettings auto-creates the index if it does not exist.
    const s = await index.updateSettings(CARD_INDEX_SETTINGS)
    await client.waitForTask(s.taskUid)
    const a = await index.addDocuments(byLang[lang], { primaryKey: 'id' })
    await client.waitForTask(a.taskUid)
  }
  return langs
}
