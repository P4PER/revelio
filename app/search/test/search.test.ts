import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { cardsIndex, CARD_INDEX_SETTINGS, buildCardDocument } from '../src/documents.js'
import type { SearchDocument, CardIndexData } from '../src/documents.js'
import { searchCards, buildFilter } from '../src/search.js'
import { testMeiliClient, uniqueLang } from './helpers.js'

const client = testMeiliClient()
const lang = uniqueLang()
const uid = cardsIndex(lang)

const docs: SearchDocument[] = [
  { id: 'a', setCode: 'BS', number: '1', numberSort: '0:000001', name: 'Harry Potter', text: 'The boy who lived', flavorText: null, types: ['character'], subTypes: ['wizard', 'gryffindor'], lesson: null, rarity: 'rare', finish: 'normal', legality: 'legal', cost: null, isOfficial: true, imageLang: 'en', defaultLanguage: 'en' },
  { id: 'b', setCode: 'BS', number: '2', numberSort: '0:000002', name: 'Flobberworm', text: 'A dull creature', flavorText: null, types: ['creature'], subTypes: [], lesson: null, rarity: 'common', finish: 'normal', legality: 'legal', cost: 2, isOfficial: true, imageLang: null, defaultLanguage: 'en' },
  { id: 'c', setCode: 'QC', number: '1', numberSort: '0:000001', name: 'The Snitch', text: 'Golden', flavorText: null, types: ['match'], subTypes: [], lesson: null, rarity: 'uncommon', finish: 'normal', legality: 'legal', cost: null, isOfficial: false, imageLang: null, defaultLanguage: 'en' },
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

describe('sorting by card number', () => {
  const sortLang = uniqueLang()
  const sortUid = cardsIndex(sortLang)
  // Deliberately inserted out of order, mixing multi-digit numbers and letter suffixes.
  const numbers = ['10', '2', '1', '3b', '20', '3a', '3', '11', '100']
  const cards: CardIndexData[] = numbers.map((n) => ({
    id: `n-${n}`, setCode: 'BS', number: n, name: `Card ${n}`,
    lesson: null, rarity: null, finish: null, legality: null, cost: null,
    isOfficial: true, types: [], subTypes: [], defaultLanguage: 'en',
    localizations: { en: { name: `Card ${n}`, text: null, flavorText: null, imageFile: null } },
  }))

  beforeAll(async () => {
    const s = await client.index(sortUid).updateSettings(CARD_INDEX_SETTINGS)
    await client.waitForTask(s.taskUid)
    const docs = cards.map((c) => buildCardDocument(c, 'en'))
    const a = await client.index(sortUid).addDocuments(docs, { primaryKey: 'id' })
    await client.waitForTask(a.taskUid)
  }, 60_000)
  afterAll(async () => { await client.deleteIndex(sortUid) })

  it('sorts numerically, not lexicographically, with suffixes after their base', async () => {
    const r = await searchCards(client, sortLang, '', { sort: ['numberSort:asc'], hitsPerPage: 100 })
    expect(r.hits.map((h) => h.number)).toEqual(
      ['1', '2', '3', '3a', '3b', '10', '11', '20', '100'],
    )
  })
})
