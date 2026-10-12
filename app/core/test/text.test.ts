import { describe, it, expect } from 'vitest'
import { truncateUnits } from '../src/text.js'

describe('truncateUnits', () => {
  it('cuts to the bound and trims both ends', () => {
    expect(truncateUnits('  abc def  ', 6)).toBe('abc')
  })
  it('drops a high surrogate the cut left alone', () => {
    expect(truncateUnits('ab\u{1F9D9}', 3)).toBe('ab')
  })
  it('keeps a whole pair inside the bound', () => {
    expect(truncateUnits('ab\u{1F9D9}', 4)).toBe('ab\u{1F9D9}')
  })
})
