import { describe, it, expect } from 'vitest'
import { cardNames, jumpZone, rowViolations, violationMessage } from '@/lib/deck-violations'

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

describe('jumpZone', () => {
  const entries = [
    { cardId: 'ron', zone: 'character' as const },
    { cardId: 'ron', zone: 'sideboard' as const },
    { cardId: 'wing', zone: 'sideboard' as const },
    { cardId: 'wing', zone: 'main' as const },
  ]

  it('prefers the main deck, then the sideboard', () => {
    expect(jumpZone(entries, 'wing', 'too_many_copies')).toBe('main')
    expect(jumpZone(entries, 'ron', 'banned_card')).toBe('sideboard')
  })

  it('sends a starting-character reason to the character slot', () => {
    expect(jumpZone(entries, 'ron', 'invalid_character')).toBe('character')
  })

  it('finds no zone for a card the deck does not hold', () => {
    expect(jumpZone(entries, 'zz', 'banned_card')).toBeUndefined()
    // A stale reason about a character since replaced has no row either.
    expect(jumpZone(entries, 'wing', 'invalid_character')).toBeUndefined()
  })
})
