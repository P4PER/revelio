import { describe, it, expect, vi } from 'vitest'
import * as dbModule from '@revelio/db'
import { clampLabel, findCards, findOneCard, resolveCardRulings } from '../src/data/cards'
import { stubMeili } from './helpers/meili'

const doc = {
  id: 'base-12', name: 'Nimbus 2000', setCode: 'base', number: '12',
  text: 'Adventure: ...', types: ['item'],
}

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
      attributesToRetrieve: [
        'id', 'name', 'setCode', 'number', 'types', 'lesson', 'cost',
        'imageVersion', 'imageLang', 'defaultLanguage', 'orientation',
      ],
    }))
  })

  it('reads five to a page by default', async () => {
    const { client, search } = stubMeili([doc], 1)
    await findCards(client, { query: 'nimbus', locale: 'en' })
    expect(search).toHaveBeenCalledWith('nimbus', expect.objectContaining({ limit: 5 }))
  })

  // With no words to rank by, Meilisearch returns index order; a set must
  // browse #1, #2, ... as the site's "number" sort does.
  it('orders a set without a query by card number', async () => {
    const { client, search } = stubMeili([doc], 1)
    await findCards(client, { query: '  ', locale: 'en', filters: { setCode: ['base'] } })
    expect(search.mock.calls[0][1]).toMatchObject({ sort: ['numberSort:asc'] })
  })

  // Card numbers restart in every set, so across sets they would interleave
  // every set's #1, then every #2.
  it('orders a search without a query or set by name', async () => {
    const { client, search } = stubMeili([doc], 1)
    await findCards(client, { query: '', locale: 'en', filters: { lesson: ['charms'] } })
    expect(search.mock.calls[0][1]).toMatchObject({ sort: ['name:asc'] })
  })

  it('ranks a query by relevance', async () => {
    const { client, search } = stubMeili([doc], 1)
    await findCards(client, { query: 'nimbus', locale: 'en', filters: { setCode: ['base'] } })
    expect(search.mock.calls[0][1].sort).toBeUndefined()
  })

  it('clamps a page below one', async () => {
    const { client, search } = stubMeili([], 5)
    await findCards(client, { query: 'x', locale: 'en', page: 0 })
    expect(search).toHaveBeenCalledWith('x', expect.objectContaining({ offset: 0 }))
  })
})

describe('findOneCard', () => {
  it('returns the single best hit as a whole document', async () => {
    const { client, search } = stubMeili([doc], 4)
    const hit = await findOneCard(client, { query: 'nimbus', locale: 'en' })
    expect(search).toHaveBeenCalledWith('nimbus', expect.objectContaining({ limit: 1 }))
    // The card embed renders the full document, so this path must not narrow the
    // projection the way the /search list does.
    expect(hit).toMatchObject({ id: 'base-12', text: 'Adventure: ...', types: ['item'] })
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

describe('clampLabel', () => {
  // A deck name is user text up to 120 units; a cut through an emoji's
  // surrogate pair would leave a lone half in a select label.
  it('never leaves half of a surrogate pair at the cut', () => {
    const label = clampLabel(`${'a'.repeat(98)}\u{1F600}${'b'.repeat(10)}`)
    expect(label.length).toBeLessThanOrEqual(100)
    expect(label).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
    expect(label.endsWith('…')).toBe(true)
  })
})
