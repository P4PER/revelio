import { describe, it, expect } from 'vitest'
import { evaluateDeck } from '../src/deck-legality.js'
import type { DeckCardMeta } from '../src/deck.js'

const meta = (over: Partial<DeckCardMeta> & { id: string }): DeckCardMeta => ({
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false, ...over,
})

// A helper that builds a legal 60-card deck: 1 char + 60 main (15 distinct × 4).
function legalDeck() {
  const m: Record<string, DeckCardMeta> = { HARRY: meta({ id: 'HARRY', isStartingCharacter: true }) }
  const entries: Array<{ cardId: string; zone: 'character' | 'main' | 'sideboard'; quantity: number }> = [{ cardId: 'HARRY', zone: 'character' as const, quantity: 1 }]
  for (let i = 0; i < 15; i++) {
    const id = `C${i}`
    m[id] = meta({ id })
    entries.push({ cardId: id, zone: 'main' as const, quantity: 4 })
  }
  return { entries, m }
}

describe('evaluateDeck', () => {
  it('legal: character + exactly 60 main + ≤4 copies', () => {
    const { entries, m } = legalDeck()
    const r = evaluateDeck(entries, 'revival', m)
    expect(r.status).toBe('legal')
    expect(r.violations).toEqual([])
  })

  it('incomplete: no character, 59 cards', () => {
    const m = { A: meta({ id: 'A' }) }
    const r = evaluateDeck([{ cardId: 'A', zone: 'main', quantity: 59 }], 'revival', m)
    // 59 copies also trips the copy limit, so status is illegal; assert the incompleteness signals exist too.
    expect(r.violations).toContainEqual({ code: 'no_character' })
    expect(r.violations).toContainEqual({ code: 'main_deck_size', actual: 59 })
  })

  it('illegal: 5 copies of a non-lesson card', () => {
    const m = { A: meta({ id: 'A' }), CH: meta({ id: 'CH', isStartingCharacter: true }) }
    const entries = [
      { cardId: 'CH', zone: 'character' as const, quantity: 1 },
      { cardId: 'A', zone: 'main' as const, quantity: 5 },
    ]
    const r = evaluateDeck(entries, 'revival', m)
    expect(r.status).toBe('illegal')
    expect(r.violations).toContainEqual({ code: 'too_many_copies', cardId: 'A', count: 5 })
  })

  it('lessons are exempt from the 4-copy limit', () => {
    const m = { L: meta({ id: 'L', isLesson: true }), CH: meta({ id: 'CH', isStartingCharacter: true }) }
    const entries = [
      { cardId: 'CH', zone: 'character' as const, quantity: 1 },
      { cardId: 'L', zone: 'main' as const, quantity: 60 },
    ]
    const r = evaluateDeck(entries, 'revival', m)
    expect(r.violations.find((v) => v.code === 'too_many_copies')).toBeUndefined()
    expect(r.status).toBe('legal')
  })

  it('copies sum across main and sideboard', () => {
    const m = { A: meta({ id: 'A' }), CH: meta({ id: 'CH', isStartingCharacter: true }) }
    const entries = [
      { cardId: 'CH', zone: 'character' as const, quantity: 1 },
      { cardId: 'A', zone: 'main' as const, quantity: 3 },
      { cardId: 'A', zone: 'sideboard' as const, quantity: 2 },
    ]
    const r = evaluateDeck(entries, 'revival', m)
    expect(r.violations).toContainEqual({ code: 'too_many_copies', cardId: 'A', count: 5 })
  })

  it('revival: banned card is illegal', () => {
    const { entries, m } = legalDeck()
    m.C0 = { ...m.C0, legality: 'banned' }
    const r = evaluateDeck(entries, 'revival', m)
    expect(r.status).toBe('illegal')
    expect(r.violations).toContainEqual({ code: 'banned_card', cardId: 'C0' })
  })

  it('classic: non-official card is out of format; banned is ignored', () => {
    const { entries, m } = legalDeck()
    m.C0 = { ...m.C0, isOfficial: false, legality: 'banned' }
    const r = evaluateDeck(entries, 'classic', m)
    expect(r.violations).toContainEqual({ code: 'card_not_in_format', cardId: 'C0' })
    expect(r.violations.find((v) => v.code === 'banned_card')).toBeUndefined()
  })

  it('multiple characters, invalid character, oversize sideboard', () => {
    const m = {
      CH1: meta({ id: 'CH1', isStartingCharacter: true }),
      CH2: meta({ id: 'CH2', isStartingCharacter: true }),
      NOPE: meta({ id: 'NOPE', isStartingCharacter: false }),
      S: meta({ id: 'S' }),
    }
    const entries = [
      { cardId: 'CH1', zone: 'character' as const, quantity: 1 },
      { cardId: 'CH2', zone: 'character' as const, quantity: 1 },
      { cardId: 'S', zone: 'sideboard' as const, quantity: 16 },
    ]
    const r = evaluateDeck(entries, 'revival', m)
    expect(r.violations).toContainEqual({ code: 'multiple_characters' })
    expect(r.violations).toContainEqual({ code: 'sideboard_too_large', actual: 16 })
  })
})
