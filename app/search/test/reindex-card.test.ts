import { describe, it, expect, afterAll } from 'vitest'
import { cardsIndex, reindexCard, type CardIndexData } from '../src/documents.js'
import { testMeiliClient, uniqueLang } from './helpers.js'

const client = testMeiliClient()
const lang = uniqueLang()
const missingLang = uniqueLang()

const data: CardIndexData = {
  id: 'zz-reindex-1', setCode: 'ZZ', number: '1', name: 'Card',
  lesson: null, rarity: null, finishes: [], legality: null, cost: null, damage: null,
  isOfficial: false, types: [], subTypes: [], defaultLanguage: lang, orientation: null, artCropVersion: null,
  localizations: { [lang]: { name: 'Zonko Zephyr', text: 'wind', flavorText: null, imageVersion: null } },
}

afterAll(async () => {
  for (const l of [lang, missingLang]) {
    const del = await client.index(cardsIndex(l)).delete()
    await client.waitForTask(del.taskUid)
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
