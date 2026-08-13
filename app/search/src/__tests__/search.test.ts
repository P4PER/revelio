import { describe, it, expect } from 'vitest'
import { searchCards } from '../search'

// Minimal fake Meili client that records the search options it was called with.
function fakeClient(captured: Record<string, unknown>) {
  return {
    index: () => ({
      search: async (_q: string, opts: Record<string, unknown>) => {
        Object.assign(captured, opts)
        return { hits: [], estimatedTotalHits: 0 }
      },
    }),
  } as never
}

describe('searchCards window option', () => {
  it('uses raw offset/limit when window is provided', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', '', { window: { offset: 41, limit: 3 } })
    expect(captured.offset).toBe(41)
    expect(captured.limit).toBe(3)
  })

  it('falls back to page/hitsPerPage when window is absent', async () => {
    const captured: Record<string, unknown> = {}
    await searchCards(fakeClient(captured), 'en', '', { page: 3, hitsPerPage: 24 })
    expect(captured.offset).toBe(48)
    expect(captured.limit).toBe(24)
  })
})
