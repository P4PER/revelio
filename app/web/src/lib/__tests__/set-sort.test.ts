import { describe, it, expect } from 'vitest'
import { byReleaseDate, formatReleaseMonth } from '../set-sort'
import type { SetDTO } from '@revelio/core'

const set = (code: string, releaseDate: string | null): SetDTO => ({
  code, name: code, releaseDate, isOfficial: true, cardCount: 0, symbol: null,
})

describe('byReleaseDate', () => {
  it('sorts chronologically (2001 before 2002)', () => {
    const sets = [set('AAH', '2002-06-01'), set('BS', '2001-08-01'), set('COS', '2002-10-01'), set('QC', '2001-11-01')]
    expect([...sets].sort(byReleaseDate).map((s) => s.code)).toEqual(['BS', 'QC', 'AAH', 'COS'])
  })
  it('also sorts legacy MM-YYYY text correctly (2026 newest)', () => {
    const sets = [set('OLD', '08-2023'), set('NEW', '03-2026'), set('MID', '11-2024')]
    expect([...sets].sort(byReleaseDate).map((s) => s.code)).toEqual(['OLD', 'MID', 'NEW'])
  })
  it('formats MM-YYYY as MM/YYYY too', () => {
    expect(formatReleaseMonth('03-2026')).toBe('03/2026')
  })
  it('puts null dates last', () => {
    expect([set('X', null), set('BS', '2001-08-01')].sort(byReleaseDate).map((s) => s.code)).toEqual(['BS', 'X'])
  })
})

describe('formatReleaseMonth', () => {
  it('formats YYYY-MM-DD as MM/YYYY', () => {
    expect(formatReleaseMonth('2001-08-01')).toBe('08/2001')
  })
  it('handles null', () => {
    expect(formatReleaseMonth(null)).toBe('—')
  })
})
