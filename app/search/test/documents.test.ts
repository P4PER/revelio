import { describe, it, expect } from 'vitest'
import { cardsIndex, CARD_INDEX_SETTINGS } from '../src/documents.js'

describe('search documents config', () => {
  it('names the per-language index', () => {
    expect(cardsIndex('en')).toBe('cards-en')
    expect(cardsIndex('de')).toBe('cards-de')
  })

  it('exposes the required facets as filterable', () => {
    for (const f of ['setCode', 'types', 'subTypes', 'lesson', 'rarity', 'finish', 'legality', 'cost', 'isOfficial']) {
      expect(CARD_INDEX_SETTINGS.filterableAttributes).toContain(f)
    }
  })

  it('searches name/text/flavor with name first', () => {
    expect(CARD_INDEX_SETTINGS.searchableAttributes?.[0]).toBe('name')
    expect(CARD_INDEX_SETTINGS.searchableAttributes).toEqual(['name', 'text', 'flavorText'])
  })
})
