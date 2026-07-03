import { describe, it, expect, afterAll } from 'vitest'
import { createMeiliClient, reindexCard, cardsIndex, type CardIndexData } from '@revelio/search'

const client = createMeiliClient(
  process.env.TEST_MEILI_HOST ?? 'http://localhost:7700',
  process.env.TEST_MEILI_KEY ?? 'masterKey',
)

const data: CardIndexData = {
  id: 'zz-reindex-1', setCode: 'ZZ', setName: 'ZZ Set', number: '1', name: 'Card',
  lesson: null, lessonColor: null, rarity: null, finish: null, legality: null, cost: null,
  isOfficial: false, types: [], subTypes: [], defaultLanguage: 'zz',
  localizations: { zz: { name: 'Zonko Zephyr', text: 'wind', flavorText: null, imageFile: null } },
}

afterAll(async () => {
  const del = await client.index(cardsIndex('zz')).delete()
  await client.waitForTask(del.taskUid)
})

describe('reindexCard', () => {
  it('indexes the card so it is searchable in its language index', async () => {
    await reindexCard(client, data)
    const res = await client.index(cardsIndex('zz')).search('Zonko')
    expect(res.hits.map((h) => (h as { id: string }).id)).toContain('zz-reindex-1')
  })
})
