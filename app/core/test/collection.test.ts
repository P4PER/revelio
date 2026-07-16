import { describe, it, expect } from 'vitest'
import { CollectionVisibility, isFinishAllowed } from '../src/collection'

describe('CollectionVisibility', () => {
  it('accepts private/public and rejects others', () => {
    expect(CollectionVisibility.parse('private')).toBe('private')
    expect(CollectionVisibility.parse('public')).toBe('public')
    expect(CollectionVisibility.safeParse('secret').success).toBe(false)
  })
})

describe('isFinishAllowed', () => {
  it('accepts a known finish present on the card', () => {
    expect(isFinishAllowed(['normal', 'holo'], 'holo')).toBe(true)
  })
  it('rejects a finish the card does not have', () => {
    expect(isFinishAllowed(['normal'], 'holo')).toBe(false)
  })
  it('rejects a finish not in the global FINISHES vocab', () => {
    expect(isFinishAllowed(['normal', 'sparkle'], 'sparkle')).toBe(false)
  })
})
