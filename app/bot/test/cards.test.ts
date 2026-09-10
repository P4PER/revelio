import { describe, it, expect, vi } from 'vitest'
import type { MeiliSearch } from 'meilisearch'
import * as dbModule from '@revelio/db'
import { findCards, findOneCard, resolveCardRulings } from '../src/data/cards'

function stubMeili(hits: unknown[], estimatedTotalHits: number) {
  const search = vi.fn().mockResolvedValue({ hits, estimatedTotalHits })
  const index = vi.fn().mockReturnValue({ search })
  return { client: { index } as unknown as MeiliSearch, index, search }
}

const doc = { id: 'base-12', name: 'Nimbus 2000', setCode: 'base', number: '12' }

describe('findCards', () => {
  it('queries the locale index and reports page arithmetic', async () => {
    const { client, index, search } = stubMeili([doc], 25)
    const page = await findCards(client, { query: 'nimbus', locale: 'de', page: 2, pageSize: 10 })

    expect(index).toHaveBeenCalledWith('cards-de')
    expect(search).toHaveBeenCalledWith('nimbus', expect.objectContaining({ limit: 10, offset: 10 }))
    expect(page).toMatchObject({ total: 25, page: 2, pageSize: 10, pages: 3 })
    expect(page.hits).toHaveLength(1)
  })

  it('reports one page when there are no results', async () => {
    const { client } = stubMeili([], 0)
    const page = await findCards(client, { query: 'zzz', locale: 'en' })
    expect(page).toMatchObject({ total: 0, page: 1, pages: 1 })
    expect(page.hits).toEqual([])
  })

  it('asks Meilisearch only for the fields the result list renders', async () => {
    const { client, search } = stubMeili([doc], 1)
    await findCards(client, { query: 'nimbus', locale: 'en' })
    expect(search).toHaveBeenCalledWith('nimbus', expect.objectContaining({
      attributesToRetrieve: ['id', 'name', 'setCode', 'number'],
    }))
  })

  it('clamps a page below one', async () => {
    const { client, search } = stubMeili([], 5)
    await findCards(client, { query: 'x', locale: 'en', page: 0 })
    expect(search).toHaveBeenCalledWith('x', expect.objectContaining({ offset: 0 }))
  })
})

describe('findOneCard', () => {
  it('returns the single best hit', async () => {
    const { client, search } = stubMeili([doc], 4)
    const hit = await findOneCard(client, { query: 'nimbus', locale: 'en' })
    expect(search).toHaveBeenCalledWith('nimbus', expect.objectContaining({ limit: 1 }))
    expect(hit).toMatchObject({ id: 'base-12' })
  })

  it('returns null when nothing matches', async () => {
    const { client } = stubMeili([], 0)
    expect(await findOneCard(client, { query: 'zzz', locale: 'en' })).toBeNull()
  })
})

describe('resolveCardRulings', () => {
  const card = {
    defaultLanguage: 'en',
    rulings: [
      { id: 'r1', seq: 1, date: '2001-11-01', source: 'WotC', text: { en: 'English text', de: 'Deutscher Text' } },
      { id: 'r2', seq: 2, date: null, source: null, text: { en: 'Only English' } },
      { id: 'r3', seq: 3, date: null, source: null, text: {} },
    ],
  }

  it('picks the requested language, falling back to the card default', async () => {
    vi.spyOn(dbModule, 'getCardRulings').mockResolvedValue(card as never)
    const rulings = await resolveCardRulings({} as never, 'base-12', 'de')
    expect(rulings.map((r) => r.text)).toEqual(['Deutscher Text', 'Only English'])
  })

  it('drops rulings with no text in any language', async () => {
    vi.spyOn(dbModule, 'getCardRulings').mockResolvedValue(card as never)
    const rulings = await resolveCardRulings({} as never, 'base-12', 'en')
    expect(rulings).toHaveLength(2)
  })

  it('returns an empty list for a card that does not exist', async () => {
    vi.spyOn(dbModule, 'getCardRulings').mockResolvedValue(null)
    expect(await resolveCardRulings({} as never, 'nope', 'en')).toEqual([])
  })
})
