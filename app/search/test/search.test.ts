import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { cardsIndex, CARD_INDEX_SETTINGS } from '../src/documents.js'
import type { SearchDocument } from '../src/documents.js'
import { searchCards, buildFilter } from '../src/search.js'
import { testMeiliClient, uniqueLang } from './helpers.js'

const client = testMeiliClient()
const lang = uniqueLang()
const uid = cardsIndex(lang)

const docs: SearchDocument[] = [
  { id: 'a', setCode: 'BS', setName: 'Base', number: '1', name: 'Harry Potter', text: 'The boy who lived', flavorText: null, types: ['character'], subTypes: ['wizard', 'gryffindor'], lesson: null, lessonColor: null, rarity: 'rare', finish: 'normal', legality: 'legal', cost: null, isOfficial: true, imageLang: 'en', defaultLanguage: 'en' },
  { id: 'b', setCode: 'BS', setName: 'Base', number: '2', name: 'Flobberworm', text: 'A dull creature', flavorText: null, types: ['creature'], subTypes: [], lesson: null, lessonColor: null, rarity: 'common', finish: 'normal', legality: 'legal', cost: 2, isOfficial: true, imageLang: null, defaultLanguage: 'en' },
  { id: 'c', setCode: 'QC', setName: 'Quidditch Cup', number: '1', name: 'The Snitch', text: 'Golden', flavorText: null, types: ['match'], subTypes: [], lesson: null, lessonColor: null, rarity: 'uncommon', finish: 'normal', legality: 'legal', cost: null, isOfficial: false, imageLang: null, defaultLanguage: 'en' },
]

beforeAll(async () => {
  const s = await client.index(uid).updateSettings(CARD_INDEX_SETTINGS)
  await client.waitForTask(s.taskUid)
  const a = await client.index(uid).addDocuments(docs, { primaryKey: 'id' })
  await client.waitForTask(a.taskUid)
}, 60_000)
afterAll(async () => { await client.deleteIndex(uid) })

describe('searchCards', () => {
  it('full-text matches on name', async () => {
    const r = await searchCards(client, lang, 'harry')
    expect(r.hits.map((h) => h.id)).toContain('a')
  })

  it('tolerates a typo', async () => {
    const r = await searchCards(client, lang, 'flobberwrom')
    expect(r.hits.map((h) => h.id)).toContain('b')
  })

  it('filters by a facet (array value)', async () => {
    const r = await searchCards(client, lang, '', { filters: { types: ['creature'] } })
    expect(r.hits.map((h) => h.id)).toEqual(['b'])
  })

  it('filters by isOfficial boolean', async () => {
    const r = await searchCards(client, lang, '', { filters: { isOfficial: false } })
    expect(r.hits.map((h) => h.id)).toEqual(['c'])
  })

  it('builds an AND-of-facets filter array', () => {
    expect(buildFilter({ types: ['character'], rarity: ['rare'] })).toEqual([
      '(types = "character")',
      '(rarity = "rare")',
    ])
    expect(buildFilter({ isOfficial: true })).toEqual(['isOfficial = true'])
    expect(buildFilter({})).toEqual([])
    expect(buildFilter({ types: ['character', 'creature'] })).toEqual([
      '(types = "character" OR types = "creature")',
    ])
  })

  it('filters by a cost range', () => {
    expect(buildFilter({ costMin: 2 })).toContain('cost >= 2')
    expect(buildFilter({ costMax: 4 })).toContain('cost <= 4')
    expect(buildFilter({ costMin: 2, costMax: 4 })).toEqual(['cost >= 2', 'cost <= 4'])
  })
})
