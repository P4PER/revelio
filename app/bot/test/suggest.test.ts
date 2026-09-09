import { describe, it, expect, vi } from 'vitest'
import type { MeiliSearch } from 'meilisearch'
import { suggestCards, findCardById, MAX_CHOICES } from '../src/data/cards'

function hit(n: number, name = `Card ${n}`) {
  return { id: `base-${n}`, name, setCode: 'base', number: String(n) }
}

function stubMeili(hits: unknown[]) {
  const search = vi.fn().mockResolvedValue({ hits, estimatedTotalHits: hits.length })
  const getDocument = vi.fn()
  const index = vi.fn().mockReturnValue({ search, getDocument })
  return { client: { index } as unknown as MeiliSearch, index, search, getDocument }
}

describe('suggestCards', () => {
  it('labels a suggestion with the name, set and number', async () => {
    const { client } = stubMeili([hit(12, 'Nimbus 2000')])
    const out = await suggestCards(client, { query: 'nim', locale: 'en' })
    expect(out).toEqual([{ id: 'base-12', label: 'Nimbus 2000 (base #12)' }])
  })

  it('queries the locale index and asks for at most 25 hits', async () => {
    const { client, index, search } = stubMeili([])
    await suggestCards(client, { query: 'x', locale: 'de' })
    expect(index).toHaveBeenCalledWith('cards-de')
    expect(search).toHaveBeenCalledWith('x', expect.objectContaining({ limit: MAX_CHOICES }))
  })

  it('never returns more than 25 suggestions', async () => {
    const { client } = stubMeili(Array.from({ length: 40 }, (_, i) => hit(i)))
    expect((await suggestCards(client, { query: 'c', locale: 'en' })).length).toBe(MAX_CHOICES)
  })

  it('keeps every label inside Discord\'s 100 character limit', async () => {
    const { client } = stubMeili([hit(1, 'z'.repeat(200))])
    const [only] = await suggestCards(client, { query: 'z', locale: 'en' })
    expect(only.label.length).toBeLessThanOrEqual(100)
  })

  it('returns an empty list for an empty query rather than calling Meilisearch', async () => {
    const { client, search } = stubMeili([])
    expect(await suggestCards(client, { query: '   ', locale: 'en' })).toEqual([])
    expect(search).not.toHaveBeenCalled()
  })
})

describe('findCardById', () => {
  it('returns the document for a known id', async () => {
    const { client, getDocument } = stubMeili([])
    getDocument.mockResolvedValue(hit(12, 'Nimbus 2000'))
    const doc = await findCardById(client, 'base-12', 'en')
    expect(doc).toMatchObject({ id: 'base-12' })
  })

  it('returns null when the id is not a document', async () => {
    const { client, getDocument } = stubMeili([])
    getDocument.mockRejectedValue(new Error('Document `nope` not found.'))
    expect(await findCardById(client, 'nope', 'en')).toBeNull()
  })
})
