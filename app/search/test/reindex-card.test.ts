import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { CARD_INDEX_SETTINGS, cardsIndex, reindexCard, type CardIndexData } from '../src/documents.js'
import { createMeiliClient } from '../src/client.js'
import { testMeiliClient, testMeiliHost, uniqueLang } from './helpers.js'

const client = testMeiliClient()
const lang = uniqueLang()
const missingLang = uniqueLang()
const scopedLang = uniqueLang()
const absentLang = uniqueLang()
const scopedAbsentLang = uniqueLang()
const conflictLang = uniqueLang()
const afterConflictLang = uniqueLang()

const data: CardIndexData = {
  id: 'zz-reindex-1', setCode: 'ZZ', number: '1', name: 'Card',
  lesson: null, rarity: null, finishes: [], legality: null, cost: null, damage: null,
  isOfficial: false, types: [], subTypes: [], defaultLanguage: lang, orientation: null, artCropVersion: null,
  localizations: { [lang]: { name: 'Zonko Zephyr', text: 'wind', flavorText: null, imageVersion: null } },
}

async function hitIds(l: string): Promise<string[]> {
  const res = await client.index(cardsIndex(l)).search('Zonko')
  return res.hits.map((h) => (h as { id: string }).id)
}

async function indexExists(l: string): Promise<boolean> {
  return (await client.getIndexes({ limit: 1000 })).results.some((i) => i.uid === cardsIndex(l))
}

// Ingest creates and configures each language index before an editor saves.
beforeAll(async () => {
  for (const l of [lang, missingLang, scopedLang, afterConflictLang]) {
    await client.index(cardsIndex(l)).updateSettings(CARD_INDEX_SETTINGS).waitTask()
  }
  // An index whose primary key is not `id`, so adding a card there fails.
  await client.createIndex(cardsIndex(conflictLang), { primaryKey: 'uid' }).waitTask()
}, 60_000)

afterAll(async () => {
  for (const l of [lang, missingLang, scopedLang, absentLang, scopedAbsentLang, conflictLang, afterConflictLang]) {
    await client.index(cardsIndex(l)).delete().waitTask()
  }
})

describe('reindexCard', () => {
  it('indexes the card so it is searchable in its language index', async () => {
    await reindexCard(client, data)
    expect(await hitIds(lang)).toContain('zz-reindex-1')
  })

  it('writes a fallback document into a language index the card lacks', async () => {
    // The card only has `lang`; indexing both gives `missingLang` the fallback doc.
    await reindexCard(client, data, [lang, missingLang])
    expect(await hitIds(missingLang)).toContain('zz-reindex-1')
  })

  it('skips a language whose index ingest never created, rather than creating it', async () => {
    // An index created here would have none of CARD_INDEX_SETTINGS, so filters
    // and sorts on it would fail until the next ingest.
    await reindexCard(client, data, [lang, absentLang])
    expect(await indexExists(absentLang)).toBe(false)
  })

  it('writes the other languages when one fails, then rejects naming it', async () => {
    // Vitest's rejects.toThrow misbehaves in this repo, so the throw is caught by hand.
    let error: unknown
    try {
      await reindexCard(client, data, [conflictLang, afterConflictLang])
    } catch (e) {
      error = e
    }
    expect(await hitIds(afterConflictLang)).toContain('zz-reindex-1')
    expect((error as Error | undefined)?.message).toContain(conflictLang)
    expect((error as Error).message).not.toContain(afterConflictLang)
  })
})

describe('reindexCard under the scoped write key', () => {
  // The key web/.env.example tells an operator to create: it may add documents,
  // look an index up and read tasks on the card indexes, and nothing else.
  let keyUid: string
  let scoped: ReturnType<typeof createMeiliClient>

  beforeAll(async () => {
    const key = await client.createKey({
      description: 'reindex-card test write key',
      actions: ['documents.add', 'indexes.get', 'tasks.get'],
      indexes: ['cards-*'],
      expiresAt: null,
    })
    keyUid = key.uid
    scoped = createMeiliClient(testMeiliHost(), key.key)
  })
  afterAll(async () => { await client.deleteKey(keyUid) })

  it('indexes the card into an existing index', async () => {
    await reindexCard(scoped, { ...data, defaultLanguage: scopedLang, localizations: { [scopedLang]: data.localizations[lang] } })
    expect(await hitIds(scopedLang)).toContain('zz-reindex-1')
  })

  it('skips a missing index instead of failing the save', async () => {
    await reindexCard(scoped, data, [scopedLang, scopedAbsentLang])
    expect(await indexExists(scopedAbsentLang)).toBe(false)
  })
})

describe('reindexCard on a document Meilisearch rejects', () => {
  it('rejects instead of reporting success', async () => {
    let error: unknown
    try {
      await reindexCard(client, { ...data, id: 'bad id!' }, [lang])
    } catch (e) {
      error = e
    }
    expect((error as Error | undefined)?.message).toMatch(/invalid_document_id/)
  })
})
