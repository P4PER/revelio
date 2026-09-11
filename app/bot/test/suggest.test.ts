import { describe, it, expect, vi } from 'vitest'
import type { MeiliSearch } from 'meilisearch'
import { suggestCards, findCardById, MAX_CHOICES } from '../src/data/cards'

function hit(n: number, name = `Card ${n}`) {
  return { id: `base-${n}`, name, setCode: 'base', number: String(n) }
}

// A relevance read leaves as a federated multi-search: a name-only query weighted
// against the unrestricted one. The stub cannot rank, so it runs only the unrestricted
// query - the one a federated read draws its full hit list from - through the same
// `search` mock, with the federated window folded back in. Assertions below therefore
// read the same call whichever transport the read used.
function federatedToSearch(search: ReturnType<typeof vi.fn>) {
  return async (req: {
    federation: Record<string, unknown>
    queries: Record<string, unknown>[]
  }) => {
    const { indexUid: _indexUid, q, federationOptions: _opts, ...rest } =
      req.queries[req.queries.length - 1] as Record<string, unknown> & { q: string }
    return search(q, { ...rest, ...req.federation })
  }
}

function stubMeili(hits: unknown[]) {
  const search = vi.fn().mockResolvedValue({ hits, estimatedTotalHits: hits.length })
  const getDocument = vi.fn()
  const index = vi.fn().mockReturnValue({ search, getDocument })
  const multiSearch = vi.fn().mockImplementation(federatedToSearch(search))
  return { client: { index, multiSearch } as unknown as MeiliSearch, index, search, getDocument }
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

  it('fetches only the label fields, not whole card documents', async () => {
    // 25 full documents per keystroke would ship every card's rules text.
    const { client, search } = stubMeili([])
    await suggestCards(client, { query: 'nim', locale: 'en' })
    expect(search).toHaveBeenCalledWith('nim', expect.objectContaining({
      attributesToRetrieve: ['id', 'name', 'setCode', 'number'],
    }))
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
  it('resolves the id with a filter rather than getDocument', async () => {
    const { client, search } = stubMeili([hit(12, 'Nimbus 2000')])
    const doc = await findCardById(client, 'base-12', 'en')
    expect(doc).toMatchObject({ id: 'base-12' })
    // Not getDocument: the bot holds the read-only search key, which Meilisearch
    // scopes to the `search` action alone. documents.get returns 403 there, and
    // the whole fast path would silently die in any correctly-scoped deployment.
    expect(search).toHaveBeenCalledWith('', expect.objectContaining({
      filter: ['id IN ["base-12"]'],
    }))
  })

  it('returns null when no card carries that id', async () => {
    const { client } = stubMeili([])
    expect(await findCardById(client, 'nope', 'en')).toBeNull()
  })

  it('returns null for an empty value without querying', async () => {
    const { client, search } = stubMeili([])
    expect(await findCardById(client, '   ', 'en')).toBeNull()
    expect(search).not.toHaveBeenCalled()
  })
})
