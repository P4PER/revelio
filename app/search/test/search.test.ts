import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { cardsIndex, CARD_INDEX_SETTINGS, buildCardDocument } from '../src/documents.js'
import type { SearchDocument, CardIndexData } from '../src/documents.js'
import { searchCards, searchCardIds } from '../src/search.js'
import { testMeiliClient, uniqueLang } from './helpers.js'

const client = testMeiliClient()
const lang = uniqueLang()
const uid = cardsIndex(lang)

const docs: SearchDocument[] = [
  { id: 'a', setCode: 'BS', number: '1', numberSort: '0:000001', name: 'Harry Potter', text: 'The boy who lived', flavorText: null, types: ['character'], subTypes: ['wizard', 'gryffindor'], lesson: null, rarity: 'rare', finishes: ['normal'], legality: 'legal', cost: null, damage: null, isOfficial: true, imageLang: 'en', imageVersion: 100, artCropVersion: 5, defaultLanguage: 'en', orientation: 'horizontal' },
  { id: 'b', setCode: 'BS', number: '2', numberSort: '0:000002', name: 'Flobberworm', text: 'A dull creature', flavorText: null, types: ['creature'], subTypes: [], lesson: null, rarity: 'common', finishes: ['normal'], legality: 'legal', cost: 2, damage: null, isOfficial: true, imageLang: null, imageVersion: null, artCropVersion: null, defaultLanguage: 'en', orientation: 'vertical' },
  { id: 'c', setCode: 'QC', number: '1', numberSort: '0:000001', name: 'The Snitch', text: 'Golden', flavorText: null, types: ['match'], subTypes: [], lesson: null, rarity: 'uncommon', finishes: ['normal'], legality: 'legal', cost: null, damage: null, isOfficial: false, imageLang: null, imageVersion: null, artCropVersion: null, defaultLanguage: 'en', orientation: 'horizontal' },
]

beforeAll(async () => {
  await client.index(uid).updateSettings(CARD_INDEX_SETTINGS).waitTask()
  await client.index(uid).addDocuments(docs, { primaryKey: 'id' }).waitTask()
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
})

describe('sorting by card number', () => {
  const sortLang = uniqueLang()
  const sortUid = cardsIndex(sortLang)
  // Deliberately inserted out of order, mixing multi-digit numbers and letter suffixes.
  const numbers = ['10', '2', '1', '3b', '20', '3a', '3', '11', '100']
  const cards: CardIndexData[] = numbers.map((n) => ({
    id: `n-${n}`, setCode: 'BS', number: n, name: `Card ${n}`,
    lesson: null, rarity: null, finishes: [], legality: null, cost: null, damage: null,
    isOfficial: true, types: [], subTypes: [], defaultLanguage: 'en', orientation: null, artCropVersion: null,
    localizations: { en: { name: `Card ${n}`, text: null, flavorText: null, imageVersion: null } },
  }))

  beforeAll(async () => {
    await client.index(sortUid).updateSettings(CARD_INDEX_SETTINGS).waitTask()
    const docs = cards.map((c) => buildCardDocument(c, 'en'))
    await client.index(sortUid).addDocuments(docs, { primaryKey: 'id' }).waitTask()
  }, 60_000)
  afterAll(async () => { await client.deleteIndex(sortUid) })

  it('sorts numerically, not lexicographically, with suffixes after their base', async () => {
    const r = await searchCards(client, sortLang, '', { sort: ['numberSort:asc'], hitsPerPage: 100 })
    expect(r.hits.map((h) => h.number)).toEqual(
      ['1', '2', '3', '3a', '3b', '10', '11', '20', '100'],
    )
  })
})


describe('name matches rank above text and flavor matches', () => {
  const rankLang = uniqueLang()
  const rankUid = cardsIndex(rankLang)
  // 'exact' matches both query terms in its name. 'partial' matches one, also in the
  // name. 'flavor' matches both, but only in flavor text. Meilisearch's `words` rule
  // ranks 'flavor' above 'partial' on its own, which is the bug: a name search comes
  // back as name hit, flavor hit, name hit.
  const rankDocs: SearchDocument[] = [
    { id: 'exact', setCode: 'BS', number: '1', numberSort: '0:000001', name: 'Harry Potter', text: 'The boy who lived', flavorText: null, types: ['character'], subTypes: [], lesson: null, rarity: null, finishes: [], legality: null, cost: null, damage: null, isOfficial: true, imageLang: null, imageVersion: null, artCropVersion: null, defaultLanguage: 'en', orientation: null },
    { id: 'partial', setCode: 'BS', number: '2', numberSort: '0:000002', name: 'Harry Hunting', text: 'Chase him down', flavorText: null, types: ['adventure'], subTypes: [], lesson: null, rarity: null, finishes: [], legality: null, cost: null, damage: null, isOfficial: true, imageLang: null, imageVersion: null, artCropVersion: null, defaultLanguage: 'en', orientation: null },
    { id: 'flavor', setCode: 'BS', number: '3', numberSort: '0:000003', name: 'Meeting on the Train', text: 'Draw a card', flavorText: 'Harry Potter sat down opposite Ron.', types: ['adventure'], subTypes: [], lesson: null, rarity: null, finishes: [], legality: null, cost: null, damage: null, isOfficial: true, imageLang: null, imageVersion: null, artCropVersion: null, defaultLanguage: 'en', orientation: null },
  ]

  beforeAll(async () => {
    await client.index(rankUid).updateSettings(CARD_INDEX_SETTINGS).waitTask()
    await client.index(rankUid).addDocuments(rankDocs, { primaryKey: 'id' }).waitTask()
  }, 60_000)
  afterAll(async () => { await client.deleteIndex(rankUid) })

  it('puts a partial name match above a whole-query flavor match', async () => {
    const r = await searchCards(client, rankLang, 'harry potter')
    expect(r.hits.map((h) => h.id)).toEqual(['exact', 'partial', 'flavor'])
  })

  it('keeps the whole-query name match at the top of the name group', async () => {
    const r = await searchCards(client, rankLang, 'harry')
    expect(r.hits.map((h) => h.id)).toEqual(['exact', 'partial', 'flavor'])
  })

  it('counts each document once across both sub-queries', async () => {
    const r = await searchCards(client, rankLang, 'harry potter')
    expect(r.total).toBe(3)
  })

  it('reads the same order through the id window the neighbour walk uses', async () => {
    const r = await searchCardIds(client, rankLang, 'harry potter', { offset: 0, limit: 3 })
    expect(r.ids).toEqual(['exact', 'partial', 'flavor'])
  })

  it('pages the merged list, rather than restarting it per group', async () => {
    const r = await searchCards(client, rankLang, 'harry potter', { page: 2, hitsPerPage: 2 })
    expect(r.hits.map((h) => h.id)).toEqual(['flavor'])
  })

  it('hands back hits without meilisearch merge bookkeeping on them', async () => {
    const r = await searchCards(client, rankLang, 'harry potter')
    expect(r.hits[0]).not.toHaveProperty('_federation')
  })

  it('leaves an explicit sort in charge of the order', async () => {
    const r = await searchCards(client, rankLang, 'harry potter', { sort: ['name:asc'] })
    // Not the name group first: with a sort the read is not federated at all, so this
    // is plain Meilisearch, where `sort` sits below `words` in the ranking rules and
    // only breaks ties inside a matched-term bucket.
    expect(r.hits.map((h) => h.id)).toEqual(['exact', 'flavor', 'partial'])
  })

  it('leaves a browse read in card-number order', async () => {
    const r = await searchCards(client, rankLang, '', { sort: ['numberSort:asc'] })
    expect(r.hits.map((h) => h.id)).toEqual(['exact', 'partial', 'flavor'])
  })
})
