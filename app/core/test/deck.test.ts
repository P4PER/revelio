import { describe, it, expect } from 'vitest'
import { DeckFormat, DeckZone, deckCardMeta, STARTING_CHARACTER_SUBTYPES } from '../src/deck.js'

describe('deck enums', () => {
  it('accepts valid format and zone', () => {
    expect(DeckFormat.parse('revival')).toBe('revival')
    expect(DeckZone.parse('sideboard')).toBe('sideboard')
  })
  it('rejects unknown values', () => {
    expect(DeckFormat.safeParse('modern').success).toBe(false)
  })
})

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
  it('exposes the recognised starting-character subtypes', () => {
    expect(STARTING_CHARACTER_SUBTYPES).toContain('wizard_witch')
  })
})
