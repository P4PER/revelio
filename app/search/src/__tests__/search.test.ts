import { describe, it, expect } from 'vitest'
import { searchCardIds, searchCards } from '../search'

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
