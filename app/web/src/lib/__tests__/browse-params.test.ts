import { describe, it, expect } from 'vitest'
import { parseBrowseParams, browseToQuery } from '@/lib/browse-params'

describe('parseBrowseParams', () => {
  it('defaults to empty query, no filters, likes sort, page 1', () => {
    expect(parseBrowseParams(new URLSearchParams())).toEqual({
      q: '', lessons: [], format: null, sort: 'likes', page: 1,
    })
  })

  it('parses q, repeated + comma lesson params, format, sort, page', () => {
    const sp = new URLSearchParams('q=aggro&lesson=charms,potions&lesson=quidditch&format=revival&sort=views&page=3')
    expect(parseBrowseParams(sp)).toEqual({
      q: 'aggro', lessons: ['charms', 'potions', 'quidditch'], format: 'revival', sort: 'views', page: 3,
    })
  })

  it('rejects invalid sort/format/page', () => {
    const sp = new URLSearchParams('sort=bogus&format=bogus&page=0')
    const s = parseBrowseParams(sp)
    expect(s.sort).toBe('likes')
    expect(s.format).toBeNull()
    expect(s.page).toBe(1)
  })
})

describe('browseToQuery', () => {
  it('omits defaults and empty values', () => {
    expect(browseToQuery({ q: '', lessons: [], format: null, sort: 'likes', page: 1 })).toEqual({})
  })
  it('serializes set values', () => {
    expect(browseToQuery({ q: 'x', lessons: ['charms', 'potions'], format: 'classic', sort: 'newest', page: 2 })).toEqual({
      q: 'x', lesson: 'charms,potions', format: 'classic', sort: 'newest', page: '2',
    })
  })
})
