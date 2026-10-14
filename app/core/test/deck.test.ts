import { describe, it, expect } from 'vitest'
import { deckCardMeta, DECK_NAME_MAX, clampDeckName, copyDeckName } from '../src/deck.js'

describe('deckCardMeta', () => {
  const base = { id: 'bs-1', isOfficial: true, legality: 'legal' }
  it('flags a witch/wizard character as a starting character', () => {
    const m = deckCardMeta({ ...base, types: ['character'], subTypes: ['wizard', 'gryffindor'] })
    expect(m.isStartingCharacter).toBe(true)
    expect(m.isLesson).toBe(false)
  })
  it('does not flag a non-character wizard-subtype card', () => {
    const m = deckCardMeta({ ...base, types: ['creature'], subTypes: ['wizard'] })
    expect(m.isStartingCharacter).toBe(false)
  })
  it('flags a lesson card', () => {
    const m = deckCardMeta({ ...base, types: ['lesson'], subTypes: [] })
    expect(m.isLesson).toBe(true)
  })
  it('flags a character carrying the combined wizard_witch subtype', () => {
    const m = deckCardMeta({ ...base, types: ['character'], subTypes: ['wizard_witch'] })
    expect(m.isStartingCharacter).toBe(true)
  })
})

describe('copyDeckName', () => {
  it('suffixes a short name', () => {
    expect(copyDeckName('Original Deck')).toBe('Original Deck (copy)')
  })
  it('cuts the base so a full-length name stays inside the bound', () => {
    const copy = copyDeckName('a'.repeat(DECK_NAME_MAX))
    expect(copy).toHaveLength(DECK_NAME_MAX)
    expect(copy.endsWith(' (copy)')).toBe(true)
  })
  it('never grows past the bound however often it is copied', () => {
    let name = 'b'.repeat(DECK_NAME_MAX - 3)
    for (let i = 0; i < 30; i++) name = copyDeckName(name)
    expect(name.length).toBeLessThanOrEqual(DECK_NAME_MAX)
  })
  it('brings an over-long legacy name back inside the bound', () => {
    expect(copyDeckName('c'.repeat(500))).toHaveLength(DECK_NAME_MAX)
  })
  it('does not leave a space before the suffix when the cut lands on one', () => {
    const base = 'd'.repeat(DECK_NAME_MAX - 8) + ' tail'
    expect(copyDeckName(base)).toBe('d'.repeat(DECK_NAME_MAX - 8) + ' (copy)')
  })
  it('does not lead with a space when the base is blank', () => {
    expect(copyDeckName('   ')).toBe('(copy)')
  })
  it('does not split a surrogate pair at the cut', () => {
    const base = 'e'.repeat(DECK_NAME_MAX - 8) + '\u{1F9D9}' + 'tail'
    const copy = copyDeckName(base)
    expect(copy).toBe('e'.repeat(DECK_NAME_MAX - 8) + ' (copy)')
    expect(copy.length).toBeLessThanOrEqual(DECK_NAME_MAX)
  })
})

describe('clampDeckName', () => {
  it('leaves a name inside the bound alone, trimmed', () => {
    expect(clampDeckName('  Deck  ')).toBe('Deck')
  })
  it('cuts an over-long name to the bound', () => {
    expect(clampDeckName('f'.repeat(300))).toBe('f'.repeat(DECK_NAME_MAX))
  })
})
