import { describe, it, expect } from 'vitest'
import { emptyDeck, addCard, copyLimitReached, setFormat } from '../deck-model'

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
  it('replaces the starting character', () => {
    let s = emptyDeck()
    s = addCard(s, view('harry', { isStartingCharacter: true }), 'character')
    s = addCard(s, view('ron', { isStartingCharacter: true }), 'character')
    expect(s.entries.filter((e) => e.zone === 'character')).toHaveLength(1)
    expect(s.entries.find((e) => e.zone === 'character')?.cardId).toBe('ron')
  })
  it('setFormat changes the format', () => {
    expect(setFormat(emptyDeck(), 'classic').format).toBe('classic')
  })
})
