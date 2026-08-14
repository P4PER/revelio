import { describe, it, expect, vi, afterEach } from 'vitest'
import type { MeiliSearch } from 'meilisearch'
import type { CardDetailDTO } from '@revelio/core'
import { MAX_TOTAL_HITS } from '@revelio/search'
import {
  getCardNeighbors, getCardNeighborsSafe, neighborsFromWindow, parseNeighborContext,
} from '../card-neighbors'

const card = (id: string): CardDetailDTO => ({ id, setCode: 'BS' } as CardDetailDTO)

// Fake client that records every search it was asked to run.
function fakeClient(calls: Record<string, unknown>[], hits: { id: string }[] = []) {
  return {
    index: () => ({
      search: async (_q: string, opts: Record<string, unknown>) => {
        calls.push(opts)
        return { hits, estimatedTotalHits: hits.length }
      },
    }),
  } as unknown as MeiliSearch
}

afterEach(() => vi.restoreAllMocks())

describe('parseNeighborContext', () => {
  it('returns null when there is no i param', () => {
    expect(parseNeighborContext(new URLSearchParams('q=harry'))).toBeNull()
  })
  it('parses a valid non-negative integer index', () => {
    const ctx = parseNeighborContext(new URLSearchParams('q=harry&i=12'))
    expect(ctx?.index).toBe(12)
    expect(ctx?.params.get('q')).toBe('harry')
  })
  it('rejects negative or non-integer indices', () => {
    expect(parseNeighborContext(new URLSearchParams('i=-1'))).toBeNull()
    expect(parseNeighborContext(new URLSearchParams('i=x'))).toBeNull()
    expect(parseNeighborContext(new URLSearchParams('i=1.5'))).toBeNull()
  })
})

describe('neighborsFromWindow', () => {
  const win = ['a', 'b', 'c']

  it('middle: prev and next around the center', () => {
    // offset = index-1, so center sits at position 1
    expect(neighborsFromWindow(win, 'b', 5)).toEqual({
      prevId: 'a', prevIndex: 4, nextId: 'c', nextIndex: 6,
    })
  })
  it('first index (0): no prev, center at position 0', () => {
    expect(neighborsFromWindow(['b', 'c'], 'b', 0)).toEqual({
      prevId: null, prevIndex: -1, nextId: 'c', nextIndex: 1,
    })
  })
  it('last index: prev but no next', () => {
    expect(neighborsFromWindow(['a', 'b'], 'b', 9)).toEqual({
      prevId: 'a', prevIndex: 8, nextId: null, nextIndex: 10,
    })
  })
  it('returns null when the center is not the current card (stale index)', () => {
    expect(neighborsFromWindow(win, 'z', 5)).toBeNull()
  })
  it('returns null for an empty window (read past maxTotalHits)', () => {
    expect(neighborsFromWindow([], 'b', 5)).toBeNull()
  })
})

describe('getCardNeighbors requests', () => {
  it('reads ids only, never whole documents', async () => {
    const calls: Record<string, unknown>[] = []
    await getCardNeighbors(fakeClient(calls), 'en', card('c'), null)
    expect(calls).toHaveLength(1)
    expect(calls[0].attributesToRetrieve).toEqual(['id'])
  })

  it('skips the window query when the index sits past maxTotalHits', async () => {
    const calls: Record<string, unknown>[] = []
    const ctx = parseNeighborContext(new URLSearchParams(`sort=number&i=${MAX_TOTAL_HITS}`))
    await getCardNeighbors(fakeClient(calls), 'en', card('c'), ctx)
    // Only the set-order walk ran: an empty deep window would just look stale.
    expect(calls).toHaveLength(1)
    expect(calls[0].offset).toBe(0)
  })
})

describe('getCardNeighborsSafe', () => {
  it('degrades to no neighbors when the client cannot be built', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await getCardNeighborsSafe(() => {
      throw new Error('MEILI_HOST is required')
    }, 'en', card('c'), null)
    expect(result).toEqual({ prev: null, next: null })
    expect(err).toHaveBeenCalled()
  })

  it('degrades to no neighbors when the search fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const down = {
      index: () => ({ search: async () => { throw new Error('meilisearch is down') } }),
    } as unknown as MeiliSearch
    expect(await getCardNeighborsSafe(() => down, 'en', card('c'), null))
      .toEqual({ prev: null, next: null })
  })

  it('passes neighbors through when the search succeeds', async () => {
    const client = fakeClient([], [{ id: 'b' }, { id: 'c' }, { id: 'd' }])
    const { prev, next } = await getCardNeighborsSafe(() => client, 'en', card('c'), null)
    expect(prev?.id).toBe('b')
    expect(next?.id).toBe('d')
  })
})
