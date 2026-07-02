import { describe, it, expect } from 'vitest'
import {
  parseSearchParams, toSearchOptions, withParams, toURLSearchParams,
} from '../search-params'

describe('search-params', () => {
  it('parses defaults', () => {
    expect(parseSearchParams(new URLSearchParams())).toEqual({
      q: '', types: [], lessons: [], official: null, sort: 'relevance', page: 1,
    })
  })

  it('parses query, multi filters, official and page', () => {
    const sp = new URLSearchParams('q=harry&type=character&type=creature&lesson=charms&official=fan&sort=name&page=3')
    expect(parseSearchParams(sp)).toEqual({
      q: 'harry', types: ['character', 'creature'], lessons: ['charms'],
      official: false, sort: 'name', page: 3,
    })
  })

  it('falls back to relevance/page 1 on bad input', () => {
    const sp = new URLSearchParams('sort=bogus&page=0')
    const s = parseSearchParams(sp)
    expect(s.sort).toBe('relevance')
    expect(s.page).toBe(1)
  })

  it('maps state to searchCards options', () => {
    const { query, options } = toSearchOptions({
      q: 'harry', types: ['creature'], lessons: [], official: true, sort: 'cost', page: 2,
    })
    expect(query).toBe('harry')
    expect(options.filters).toEqual({ types: ['creature'], isOfficial: true })
    expect(options.sort).toEqual(['cost:asc'])
    expect(options.page).toBe(2)
    // relevance -> no sort
    expect(toSearchOptions({ q: '', types: [], lessons: [], official: null, sort: 'relevance', page: 1 }).options.sort).toBeUndefined()
  })

  it('withParams sets a value and resets page', () => {
    const cur = new URLSearchParams('q=harry&page=4')
    const next = withParams(cur, { type: ['creature'] })
    expect(next.getAll('type')).toEqual(['creature'])
    expect(next.get('q')).toBe('harry')
    expect(next.has('page')).toBe(false) // reset
  })

  it('withParams keeps page when only page changes', () => {
    const next = withParams(new URLSearchParams('q=x'), { page: '2' })
    expect(next.get('page')).toBe('2')
  })

  it('toURLSearchParams handles array + scalar record', () => {
    const p = toURLSearchParams({ q: 'x', type: ['a', 'b'], page: undefined })
    expect(p.get('q')).toBe('x')
    expect(p.getAll('type')).toEqual(['a', 'b'])
    expect(p.has('page')).toBe(false)
  })
})
