import { describe, it, expect } from 'vitest'
import {
  searchCardFields,
  searchCardIds,
  searchCardSuggestions,
  searchCardSummaries,
  searchCards,
} from '../search'

// Minimal fake Meili client that records the search options it was called with.
// A relevance read goes out as a federated multi-search rather than an index search,
// so the stub answers both and records them the same way: the window from `federation`
// merged onto the unrestricted sub-query. `queries` is kept as well, for the
// assertions that are about the federation itself.
function fakeClient(captured: Record<string, unknown>, hits: { id: string }[] = []) {
  const result = { hits, estimatedTotalHits: hits.length }
  return {
    index: () => ({
      search: async (_q: string, opts: Record<string, unknown>) => {
        Object.assign(captured, opts, { federated: false })
        return result
      },
    }),
    multiSearch: async (req: {
      federation: Record<string, unknown>
      queries: Record<string, unknown>[]
    }) => {
      const unrestricted = req.queries[req.queries.length - 1]
      Object.assign(captured, unrestricted, req.federation, {
        federated: true,
        queries: req.queries,
      })
      return {
        // Meilisearch stamps its merge bookkeeping onto every federated hit; the
        // read under test has to strip it before the hits reach a caller.
        hits: hits.map((h) => ({
          ...h,
          _federation: { indexUid: 'x', queriesPosition: 0, weightedRankingScore: 1 },
        })),
        estimatedTotalHits: hits.length,
      }
    },
  } as never
}

describe('searchCards', () => {
  it('derives offset/limit from page and hitsPerPage', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', '', { page: 3, hitsPerPage: 24 })
    expect(captured.offset).toBe(48)
    expect(captured.limit).toBe(24)
  })

  it('echoes back the page it actually read', async () => {
    const res = await searchCards(fakeClient({}), 'en', '', { page: 3, hitsPerPage: 24 })
    expect(res.page).toBe(3)
    expect(res.hitsPerPage).toBe(24)
  })

  it('asks for whole documents', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', '', {})
    expect(captured.attributesToRetrieve).toBeUndefined()
  })
})

describe('searchCardSummaries', () => {
  it('pages like searchCards but asks only for the label fields', async () => {
    const captured: Record<string, unknown> = {}
    await searchCardSummaries(fakeClient(captured), 'en', 'nim', { page: 2, hitsPerPage: 10 })
    expect(captured.offset).toBe(10)
    expect(captured.limit).toBe(10)
    expect(captured.attributesToRetrieve).toEqual(['id', 'name', 'setCode', 'number'])
  })

  it('reports the window it read alongside the hits', async () => {
    const res = await searchCardSummaries(
      fakeClient({}, [{ id: 'a' }]), 'en', 'x', { page: 2, hitsPerPage: 10 },
    )
    expect(res).toMatchObject({ total: 1, page: 2, hitsPerPage: 10 })
    expect(res.hits.map((h) => h.id)).toEqual(['a'])
  })
})

describe('searchCardIds', () => {
  it('uses the raw window and asks for ids only', async () => {
    const captured: Record<string, unknown> = {}
    await searchCardIds(fakeClient(captured), 'en', '', { offset: 41, limit: 3 })
    expect(captured.offset).toBe(41)
    expect(captured.limit).toBe(3)
    expect(captured.attributesToRetrieve).toEqual(['id'])
  })

  it('flattens hits to ids in result order', async () => {
    const res = await searchCardIds(
      fakeClient({}, [{ id: 'a' }, { id: 'b' }]), 'en', '', { offset: 0, limit: 2 },
    )
    expect(res.ids).toEqual(['a', 'b'])
    expect(res.total).toBe(2)
  })
})

describe('searchCardSuggestions', () => {
  it('asks only for the fields a picker label needs', async () => {
    const captured: Record<string, unknown> = {}
    await searchCardSuggestions(fakeClient(captured), 'en', 'nim', 25)
    expect(captured.limit).toBe(25)
    expect(captured.attributesToRetrieve).toEqual(['id', 'name', 'setCode', 'number'])
  })

  it('returns the hits in relevance order', async () => {
    const hits = [{ id: 'a' }, { id: 'b' }]
    const res = await searchCardSuggestions(fakeClient({}, hits), 'en', 'x', 2)
    expect(res.map((h) => h.id)).toEqual(['a', 'b'])
  })
})

describe('searchCardFields', () => {
  it('asks for exactly the fields it was given, on the requested page', async () => {
    const captured: Record<string, unknown> = {}
    await searchCardFields(
      fakeClient(captured), 'en', '', ['id', 'name', 'orientation'], { page: 2, hitsPerPage: 12 },
    )
    expect(captured.attributesToRetrieve).toEqual(['id', 'name', 'orientation'])
    expect(captured.offset).toBe(12)
    expect(captured.limit).toBe(12)
  })

  it('copies the tuple instead of handing the caller\'s array to the client', async () => {
    const captured: Record<string, unknown> = {}
    const fields = ['id', 'name'] as const
    await searchCardFields(fakeClient(captured), 'en', '', fields)
    expect(captured.attributesToRetrieve).not.toBe(fields)
    expect(captured.attributesToRetrieve).toEqual(['id', 'name'])
  })
})


describe('relevance reads', () => {
  it('federates a name-restricted query so name matches outrank text matches', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', 'harry', { page: 2, hitsPerPage: 24 })
    expect(captured.federated).toBe(true)
    const queries = captured.queries as Record<string, unknown>[]
    expect(queries).toHaveLength(2)
    expect(queries[0]).toMatchObject({
      indexUid: 'cards-en', q: 'harry', attributesToSearchOn: ['name'],
      federationOptions: { weight: 10 },
    })
    expect(queries[1]).toMatchObject({ indexUid: 'cards-en', q: 'harry' })
    expect(queries[1].attributesToSearchOn).toBeUndefined()
    expect((queries[1].federationOptions as { weight: number }).weight).toBe(1)
  })

  it('reads its window through the federation, not the sub-queries', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', 'harry', { page: 2, hitsPerPage: 24 })
    expect(captured.offset).toBe(24)
    expect(captured.limit).toBe(24)
  })

  it('applies the caller filters to both sub-queries', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', 'harry', { filters: { types: ['creature'] } })
    const queries = captured.queries as { filter: string[] }[]
    expect(queries[0].filter).toEqual(['(types = "creature")'])
    expect(queries[1].filter).toEqual(['(types = "creature")'])
  })

  it('projects both sub-queries, so a federated hit is no wider than a plain one', async () => {
    const captured: Record<string, unknown> = {}
    await searchCardFields(fakeClient(captured), 'en', 'harry', ['id', 'name'])
    const queries = captured.queries as { attributesToRetrieve: string[] }[]
    expect(queries[0].attributesToRetrieve).toEqual(['id', 'name'])
    expect(queries[1].attributesToRetrieve).toEqual(['id', 'name'])
  })

  it('strips the merge bookkeeping meilisearch stamps on a federated hit', async () => {
    const res = await searchCards(fakeClient({}, [{ id: 'a' }]), 'en', 'harry')
    expect(res.hits[0]).not.toHaveProperty('_federation')
    expect(res.hits[0]).toMatchObject({ id: 'a' })
  })

  it('federates the id window too, so neighbours walk the order the grid showed', async () => {
    const captured: Record<string, unknown> = {}
    await searchCardIds(fakeClient(captured), 'en', 'harry', { offset: 3, limit: 3 })
    expect(captured.federated).toBe(true)
    expect(captured.offset).toBe(3)
    const queries = captured.queries as { attributesToRetrieve: string[] }[]
    expect(queries[0].attributesToRetrieve).toEqual(['id'])
  })

  it('leaves an explicit sort unfederated, so the sort is not overruled', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', 'harry', { sort: ['name:asc'] })
    expect(captured.federated).toBe(false)
  })

  it('leaves a browse read unfederated, where both sub-queries would tie', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', '', {})
    expect(captured.federated).toBe(false)
  })

  it('treats a whitespace-only query as a browse read', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', '   ', {})
    expect(captured.federated).toBe(false)
  })
})
