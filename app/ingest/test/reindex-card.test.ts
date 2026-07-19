import { describe, it, expect, afterAll } from 'vitest'
import { createMeiliClient, reindexCard, cardsIndex, type CardIndexData } from '@revelio/search'

const client = createMeiliClient(
  process.env.TEST_MEILI_HOST ?? 'http://localhost:7700',
  process.env.TEST_MEILI_KEY ?? 'masterKey',
)

const data: CardIndexData = {
  id: 'zz-reindex-1', setCode: 'ZZ', number: '1', name: 'Card',
  lesson: null, rarity: null, finishes: [], legality: null, cost: null,
  isOfficial: false, types: [], subTypes: [], defaultLanguage: 'zz',
  localizations: { zz: { name: 'Zonko Zephyr', text: 'wind', flavorText: null, imageVersion: null } },
}

afterAll(async () => {
  for (const lang of ['zz', 'zx']) {
    const del = await client.index(cardsIndex(lang)).delete()
    await client.waitForTask(del.taskUid)
  }
})

describe('reindexCard', () => {
  it('indexes the card so it is searchable in its language index', async () => {
    await reindexCard(client, data)
    const res = await client.index(cardsIndex('zz')).search('Zonko')
    expect(res.hits.map((h) => (h as { id: string }).id)).toContain('zz-reindex-1')
  })

  it('writes a fallback document into a language index the card lacks', async () => {
    // card only has 'zz'; ask to index both 'zz' and 'zx' -> 'zx' gets the fallback doc
    await reindexCard(client, data, ['zz', 'zx'])
    const res = await client.index(cardsIndex('zx')).search('Zonko')
    expect(res.hits.map((h) => (h as { id: string }).id)).toContain('zz-reindex-1')
  })
})
