import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { CARD_INDEX_SETTINGS, cardsIndex, reindexCard, type CardIndexData } from '../src/documents.js'
import { createMeiliClient } from '../src/client.js'
import { testMeiliClient, uniqueLang } from './helpers.js'

const client = testMeiliClient()
const lang = uniqueLang()
const missingLang = uniqueLang()
const scopedLang = uniqueLang()

const data: CardIndexData = {
  id: 'zz-reindex-1', setCode: 'ZZ', number: '1', name: 'Card',
  lesson: null, rarity: null, finishes: [], legality: null, cost: null, damage: null,
  isOfficial: false, types: [], subTypes: [], defaultLanguage: lang, orientation: null, artCropVersion: null,
  localizations: { [lang]: { name: 'Zonko Zephyr', text: 'wind', flavorText: null, imageVersion: null } },
}

afterAll(async () => {
  for (const l of [lang, missingLang, scopedLang]) {
    await client.index(cardsIndex(l)).delete().waitTask()
  }
})

describe('reindexCard', () => {
  it('indexes the card so it is searchable in its language index', async () => {
    await reindexCard(client, data)
    const res = await client.index(cardsIndex(lang)).search('Zonko')
    expect(res.hits.map((h) => (h as { id: string }).id)).toContain('zz-reindex-1')
  })

  it('writes a fallback document into a language index the card lacks', async () => {
    // The card only has `lang`; indexing both gives `missingLang` the fallback doc.
    await reindexCard(client, data, [lang, missingLang])
    const res = await client.index(cardsIndex(missingLang)).search('Zonko')
    expect(res.hits.map((h) => (h as { id: string }).id)).toContain('zz-reindex-1')
  })
})

describe('reindexCard under the scoped write key', () => {
  // The key web/.env.example tells an operator to create: it may add documents
  // and read tasks on the card indexes, and nothing else.
  let keyUid: string
  let scoped: ReturnType<typeof createMeiliClient>

  beforeAll(async () => {
    const key = await client.createKey({
      description: 'reindex-card test write key',
      actions: ['documents.add', 'tasks.get'],
      indexes: ['cards-*'],
      expiresAt: null,
    })
    keyUid = key.uid
    scoped = createMeiliClient(process.env.TEST_MEILI_HOST ?? 'http://localhost:7700', key.key)
    // Ingest has created and configured every language index before an editor saves.
    await client.index(cardsIndex(scopedLang)).updateSettings(CARD_INDEX_SETTINGS).waitTask()
  })
  afterAll(async () => { await client.deleteKey(keyUid) })

  it('indexes the card into an existing index', async () => {
    await reindexCard(scoped, { ...data, defaultLanguage: scopedLang, localizations: { [scopedLang]: data.localizations[lang] } })
    const res = await client.index(cardsIndex(scopedLang)).search('Zonko')
    expect(res.hits.map((h) => (h as { id: string }).id)).toContain('zz-reindex-1')
  })
})

describe('reindexCard on a document Meilisearch rejects', () => {
  it('rejects instead of reporting success', async () => {
    // Vitest's rejects.toThrow misbehaves in this repo, so the throw is caught by hand.
    let error: unknown
    try {
      await reindexCard(client, { ...data, id: 'bad id!' }, [lang])
    } catch (e) {
      error = e
    }
    expect((error as Error | undefined)?.message).toMatch(/invalid_document_id/)
  })
})
