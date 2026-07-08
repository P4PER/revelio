import { describe, it, expect } from 'vitest'
import type { DeckCardView } from '@revelio/core'
import { deckStats } from '../deck-stats'

function view(partial: Partial<DeckCardView> & Pick<DeckCardView, 'cardId' | 'zone' | 'quantity'>): DeckCardView {
  return {
    name: partial.cardId, cost: null, setCode: 'BS', number: '1', lesson: null,
    isOfficial: true, legality: null, isLesson: false, isStartingCharacter: false,
    ...partial,
  }
}

describe('deckStats', () => {
  it('separates main entries and sums main count', () => {
    const views = [
      view({ cardId: 'harry', zone: 'character', quantity: 1, isStartingCharacter: true }),
      view({ cardId: 'accio', zone: 'main', quantity: 4 }),
      view({ cardId: 'lumos', zone: 'main', quantity: 3 }),
      view({ cardId: 'side1', zone: 'sideboard', quantity: 2 }),
    ]
    const s = deckStats(views, 'revival')
    expect(s.mainEntries.map((e) => e.cardId)).toEqual(['accio', 'lumos'])
    expect(s.mainCount).toBe(7)
  })

  it('reports incomplete for an under-size main deck', () => {
    const views = [view({ cardId: 'harry', zone: 'character', quantity: 1, isStartingCharacter: true })]
    const s = deckStats(views, 'revival')
    expect(s.status).toBe('incomplete')
    expect(Array.isArray(s.violations)).toBe(true)
  })
})
