import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createMeiliClient, cardsIndex, CARD_INDEX_SETTINGS, type SearchDocument } from '@revelio/search'
import { runSearch, runSearchFields } from '../search-client'
import { parseSearchParams } from '@/lib/search-params'
import { CARD_TILE_FIELDS } from '@/lib/search-projections'

const lang = `test${randomUUID().replace(/-/g, '')}`
const client = createMeiliClient(
  process.env.TEST_MEILI_HOST ?? 'http://localhost:7700',
  process.env.TEST_MEILI_KEY ?? 'masterKey',
)

const docs: SearchDocument[] = [
  { id: 'a', setCode: 'BS', number: '1', name: 'Harry Potter', text: null, flavorText: null, types: ['character'], subTypes: [], lesson: null, rarity: 'rare', finishes: ['normal'], legality: 'legal', cost: null, isOfficial: true, imageLang: 'en', imageVersion: 1, defaultLanguage: 'en', orientation: 'vertical' },
  { id: 'b', setCode: 'BS', number: '2', name: 'Flobberworm', text: null, flavorText: null, types: ['creature'], subTypes: [], lesson: null, rarity: 'common', finishes: ['normal'], legality: 'legal', cost: 2, isOfficial: false, imageLang: null, imageVersion: null, defaultLanguage: 'en', orientation: null },
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

describe('runSearchFields', () => {
  it('returns exactly the projected fields and nothing else', async () => {
    const r = await runSearchFields(
      client, lang, parseSearchParams(new URLSearchParams('q=harry')), CARD_TILE_FIELDS,
    )
    expect(r.hits).toHaveLength(1)
    expect(Object.keys(r.hits[0]).sort()).toEqual([...CARD_TILE_FIELDS].sort())
  })

  it('drops the heavy fields the tile never reads', async () => {
    const r = await runSearchFields(
      client, lang, parseSearchParams(new URLSearchParams('q=harry')), CARD_TILE_FIELDS,
    )
    expect(r.hits[0]).not.toHaveProperty('text')
    expect(r.hits[0]).not.toHaveProperty('flavorText')
  })

  it('still applies the url filters', async () => {
    const r = await runSearchFields(
      client, lang, parseSearchParams(new URLSearchParams('type=creature')), CARD_TILE_FIELDS,
    )
    expect(r.hits.map((h) => h.id)).toEqual(['b'])
  })
})
