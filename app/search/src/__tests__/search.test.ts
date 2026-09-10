import { describe, it, expect } from 'vitest'
import { searchCardIds, searchCardSuggestions, searchCards } from '../search'

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
