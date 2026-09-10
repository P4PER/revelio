import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createMeiliClient, cardsIndex, CARD_INDEX_SETTINGS, type SearchDocument } from '@revelio/search'
import { runSearch } from '../search-client'
import { parseSearchParams } from '@/lib/search-params'
import { CARD_TILE_FIELDS, DECK_BROWSE_FIELDS } from '@/lib/search-projections'

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
  it('returns exactly the projected fields and nothing else', async () => {
    const r = await runSearch(
      client, lang, parseSearchParams(new URLSearchParams('q=harry')), CARD_TILE_FIELDS,
    )
    expect(r.hits).toHaveLength(1)
    expect(Object.keys(r.hits[0]).sort()).toEqual([...CARD_TILE_FIELDS].sort())
  })

  it('drops the heavy fields the tile never reads', async () => {
    const r = await runSearch(
      client, lang, parseSearchParams(new URLSearchParams('q=harry')), CARD_TILE_FIELDS,
    )
    expect(r.hits[0]).not.toHaveProperty('text')
    expect(r.hits[0]).not.toHaveProperty('flavorText')
  })

  it('still applies the url filters', async () => {
    const r = await runSearch(
      client, lang, parseSearchParams(new URLSearchParams('type=creature')), CARD_TILE_FIELDS,
    )
    expect(r.hits.map((h) => h.id)).toEqual(['b'])
  })

  it('applies the official/fan filter', async () => {
    const r = await runSearch(
      client, lang, parseSearchParams(new URLSearchParams('official=fan')), CARD_TILE_FIELDS,
    )
    expect(r.hits.map((h) => h.id)).toEqual(['b'])
  })

  it('keeps every field the deck browser builds a card view from', async () => {
    const r = await runSearch(
      client, lang, parseSearchParams(new URLSearchParams('q=harry')), DECK_BROWSE_FIELDS,
    )
    // toAddView reads all of these; a missing one is a blank tile or a throw.
    for (const key of ['id', 'name', 'setCode', 'number', 'types', 'subTypes', 'legality', 'isOfficial']) {
      expect(r.hits[0]).toHaveProperty(key)
    }
    expect(r.hits[0]).not.toHaveProperty('text')
  })
})
