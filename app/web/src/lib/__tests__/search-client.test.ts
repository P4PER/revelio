import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createMeiliClient, cardsIndex, CARD_INDEX_SETTINGS, type SearchDocument } from '@revelio/search'
import { runSearch } from '../search-client'
import { parseSearchParams } from '../search-params'

const lang = `test${randomUUID().replace(/-/g, '')}`
const client = createMeiliClient(
  process.env.TEST_MEILI_HOST ?? 'http://localhost:7700',
  process.env.TEST_MEILI_KEY ?? 'masterKey',
)

const docs: SearchDocument[] = [
  { id: 'a', setCode: 'BS', number: '1', name: 'Harry Potter', text: null, flavorText: null, types: ['character'], subTypes: [], lesson: null, rarity: 'rare', finish: 'normal', legality: 'legal', cost: null, isOfficial: true, imageLang: 'en', defaultLanguage: 'en' },
  { id: 'b', setCode: 'BS', number: '2', name: 'Flobberworm', text: null, flavorText: null, types: ['creature'], subTypes: [], lesson: null, rarity: 'common', finish: 'normal', legality: 'legal', cost: 2, isOfficial: false, imageLang: null, defaultLanguage: 'en' },
]

beforeAll(async () => {
  const s = await client.index(cardsIndex(lang)).updateSettings(CARD_INDEX_SETTINGS)
  await client.waitForTask(s.taskUid)
  const a = await client.index(cardsIndex(lang)).addDocuments(docs, { primaryKey: 'id' })
  await client.waitForTask(a.taskUid)
}, 60_000)
afterAll(async () => { await client.deleteIndex(cardsIndex(lang)) })

describe('runSearch', () => {
  it('full-text search returns matching cards', async () => {
    const r = await runSearch(client, lang, parseSearchParams(new URLSearchParams('q=harry')))
    expect(r.hits.map((h) => h.id)).toContain('a')
  })

  it('applies a type filter from the url', async () => {
    const r = await runSearch(client, lang, parseSearchParams(new URLSearchParams('type=creature')))
    expect(r.hits.map((h) => h.id)).toEqual(['b'])
  })

  it('applies the official/fan filter', async () => {
    const r = await runSearch(client, lang, parseSearchParams(new URLSearchParams('official=fan')))
    expect(r.hits.map((h) => h.id)).toEqual(['b'])
  })
})
