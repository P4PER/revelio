import { describe, it, expect } from 'vitest'
import {
  searchCardFields,
  searchCardIds,
  searchCardSuggestions,
  searchCardSummaries,
  searchCards,
} from '../search'

// Minimal fake Meili client that records the search options it was called with.
function fakeClient(captured: Record<string, unknown>, hits: { id: string }[] = []) {
  return {
    index: () => ({
      search: async (_q: string, opts: Record<string, unknown>) => {
        Object.assign(captured, opts)
        return { hits, estimatedTotalHits: hits.length }
      },
    }),
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
