import { describe, it, expect } from 'vitest'
import { emptyDeck, addCard, clampQuantity, copyLimitReached, maxQuantity, setFormat } from '../deck-model'

const view = (id: string, over: Partial<Parameters<typeof addCard>[1]> = {}) => ({
  cardId: id, name: id, cost: 1, setCode: 'BS', number: '1', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false, ...over,
})

describe('deck model', () => {
  it('adds and stacks copies', () => {
    let s = emptyDeck()
    s = addCard(s, view('accio'), 'main')
    s = addCard(s, view('accio'), 'main')
    expect(s.entries.find((e) => e.cardId === 'accio')?.quantity).toBe(2)
  })
  it('refuses the 5th copy of a non-lesson card', () => {
    let s = emptyDeck()
    for (let i = 0; i < 6; i++) s = addCard(s, view('accio'), 'main')
    expect(s.entries.find((e) => e.cardId === 'accio')?.quantity).toBe(4)
    expect(copyLimitReached(s, 'accio', false)).toBe(true)
  })
  it('allows unlimited lessons', () => {
    let s = emptyDeck()
    for (let i = 0; i < 9; i++) s = addCard(s, view('lesson', { isLesson: true }), 'main')
    expect(s.entries.find((e) => e.cardId === 'lesson')?.quantity).toBe(9)
  })
  it('caps a single entry at the copies left over from the other zone', () => {
    let s = emptyDeck()
    s = addCard(s, view('accio'), 'main')
    s = addCard(s, view('accio'), 'sideboard')
    expect(maxQuantity(s, 'accio', 'main', false)).toBe(3)
    expect(maxQuantity(s, 'accio', 'sideboard', false)).toBe(3)
  })
  it('does not cap lessons or the character slot', () => {
    let s = emptyDeck()
    s = addCard(s, view('lesson', { isLesson: true }), 'main')
    expect(maxQuantity(s, 'lesson', 'main', true)).toBe(Infinity)
    expect(maxQuantity(s, 'harry', 'character', false)).toBe(Infinity)
  })
  it('replaces the starting character', () => {
    let s = emptyDeck()
    s = addCard(s, view('harry', { isStartingCharacter: true }), 'character')
    s = addCard(s, view('ron', { isStartingCharacter: true }), 'character')
    expect(s.entries.filter((e) => e.zone === 'character')).toHaveLength(1)
    expect(s.entries.find((e) => e.zone === 'character')?.cardId).toBe('ron')
  })
  it('caps a requested quantity at the four-copy rule', () => {
    let s = emptyDeck()
    s = addCard(s, view('accio'), 'main')
    expect(clampQuantity(s, 'accio', 'main', 9)).toBe(4)
    expect(clampQuantity(s, 'accio', 'main', 3)).toBe(3)
  })
  it('reports no change for a request that lands on the current quantity', () => {
    let s = emptyDeck()
    for (let i = 0; i < 4; i++) s = addCard(s, view('accio'), 'main')
    expect(clampQuantity(s, 'accio', 'main', 5)).toBe(null)
    expect(clampQuantity(s, 'accio', 'main', 4)).toBe(null)
    expect(clampQuantity(s, 'missing', 'main', 2)).toBe(null)
  })
  // An import writes line quantities through unchecked, so an entry can open
  // above the limit. Stepping it must move one copy at a time rather than
  // snapping down to four - least of all when the step was an increase.
  it('never drags an over-limit entry down to the limit', () => {
    const s = { ...emptyDeck(), entries: [{ ...view('accio'), zone: 'main' as const, quantity: 6 }] }
    expect(clampQuantity(s, 'accio', 'main', 7)).toBe(null)
    expect(clampQuantity(s, 'accio', 'main', 5)).toBe(5)
    expect(clampQuantity(s, 'accio', 'main', 0)).toBe(0)
  })
  it('setFormat changes the format', () => {
    expect(setFormat(emptyDeck(), 'classic').format).toBe('classic')
  })
})
