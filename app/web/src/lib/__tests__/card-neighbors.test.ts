import { describe, it, expect } from 'vitest'
import { parseNeighborContext, neighborsFromWindow } from '../card-neighbors'

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
  const win = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('middle: prev and next around the center', () => {
    // offset = index-1, so center sits at position 1
    expect(neighborsFromWindow(win, 'b', 5)).toEqual({
      prevId: 'a', prevIndex: 4, nextId: 'c', nextIndex: 6,
    })
  })
  it('first index (0): no prev, center at position 0', () => {
    expect(neighborsFromWindow([{ id: 'b' }, { id: 'c' }], 'b', 0)).toEqual({
      prevId: null, prevIndex: -1, nextId: 'c', nextIndex: 1,
    })
  })
  it('last index: prev but no next', () => {
    expect(neighborsFromWindow([{ id: 'a' }, { id: 'b' }], 'b', 9)).toEqual({
      prevId: 'a', prevIndex: 8, nextId: null, nextIndex: 10,
    })
  })
  it('returns null when the center is not the current card (stale index)', () => {
    expect(neighborsFromWindow(win, 'z', 5)).toBeNull()
  })
})
