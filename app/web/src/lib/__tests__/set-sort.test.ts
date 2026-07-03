import { describe, it, expect } from 'vitest'
import { byReleaseDate, releaseKey } from '../set-sort'
import type { SetDTO } from '@revelio/core'

const set = (code: string, releaseDate: string | null): SetDTO => ({
  code, name: code, releaseDate, isOfficial: true, cardCount: 0, symbol: null,
})

describe('byReleaseDate', () => {
  it('sorts MM-YYYY chronologically (2001 before 2002)', () => {
    const sets = [set('AAH', '06-2002'), set('BS', '08-2001'), set('COS', '10-2002'), set('QC', '11-2001')]
    expect([...sets].sort(byReleaseDate).map((s) => s.code)).toEqual(['BS', 'QC', 'AAH', 'COS'])
  })
  it('puts null dates last', () => {
    expect([...[set('X', null), set('BS', '08-2001')]].sort(byReleaseDate).map((s) => s.code)).toEqual(['BS', 'X'])
  })
  it('releaseKey converts MM-YYYY to YYYY-MM', () => {
    expect(releaseKey('08-2001')).toBe('2001-08')
  })
})
