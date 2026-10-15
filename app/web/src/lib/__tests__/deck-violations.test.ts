import { describe, it, expect } from 'vitest'
import { cardNames, rowViolations, violationMessage } from '@/lib/deck-violations'

describe('violationMessage', () => {
  const names = { wing: 'Wingardium Leviosa' }

  it('passes the card name, not the id', () => {
    expect(violationMessage({ code: 'too_many_copies', cardId: 'wing', count: 5 }, names)).toEqual({
      key: 'violation.too_many_copies',
      values: { count: 5, name: 'Wingardium Leviosa' },
    })
  })

  it('falls back to the id when the name is unknown', () => {
    expect(violationMessage({ code: 'banned_card', cardId: 'zz' }, names).values).toEqual({ name: 'zz' })
  })

  it('passes deck-wide values through unchanged', () => {
    expect(violationMessage({ code: 'main_deck_size', actual: 58 }, names)).toEqual({
      key: 'violation.main_deck_size',
      values: { actual: 58 },
    })
  })
})

describe('rowViolations', () => {
  it('groups card-level codes by card and skips deck-wide ones', () => {
    const marks = rowViolations([
      { code: 'main_deck_size', actual: 58 },
      { code: 'too_many_copies', cardId: 'wing', count: 5 },
      { code: 'banned_card', cardId: 'wing' },
      { code: 'invalid_character', cardId: 'ron' },
    ])
    expect(marks.get('wing')).toEqual(['too_many_copies', 'banned_card'])
    expect(marks.get('ron')).toEqual(['invalid_character'])
    expect(marks.size).toBe(2)
  })
})

describe('cardNames', () => {
  it('maps ids to names', () => {
    expect(cardNames([{ cardId: 'a', name: 'Accio' }])).toEqual({ a: 'Accio' })
  })
})
