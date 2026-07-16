import { describe, it, expect } from 'vitest'
import { parseOwnership, applyOwnership } from '../collection-search'

describe('parseOwnership', () => {
  it('reads a valid value', () => {
    expect(parseOwnership(new URLSearchParams('owned=missing'))).toBe('missing')
  })
  it('returns null for absent/invalid', () => {
    expect(parseOwnership(new URLSearchParams(''))).toBeNull()
    expect(parseOwnership(new URLSearchParams('owned=nope'))).toBeNull()
  })
})

describe('applyOwnership', () => {
  const base = { filters: {}, page: 1, hitsPerPage: 24 }
  it('owned -> ids', () => {
    const o = applyOwnership(base, 'owned', ['a', 'b'], ['a'])
    expect(o.filters?.ids).toEqual(['a', 'b'])
  })
  it('missing -> excludeIds', () => {
    const o = applyOwnership(base, 'missing', ['a', 'b'], [])
    expect(o.filters?.excludeIds).toEqual(['a', 'b'])
  })
  it('dupes -> ids from duplicates', () => {
    const o = applyOwnership(base, 'dupes', ['a', 'b'], ['b'])
    expect(o.filters?.ids).toEqual(['b'])
  })
  it('null -> unchanged', () => {
    expect(applyOwnership(base, null, ['a'], ['a']).filters?.ids).toBeUndefined()
  })
  it('owned with nothing owned -> sentinel that matches no card', () => {
    const o = applyOwnership(base, 'owned', [], [])
    expect(o.filters?.ids).toEqual([' '])
  })
})
