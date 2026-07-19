import { describe, it, expect } from 'vitest'
import { cardsIndex, CARD_INDEX_SETTINGS, cardNumberSortKey, buildCardDocument } from '../src/documents.js'

describe('search documents config', () => {
  it('names the per-language index', () => {
    expect(cardsIndex('en')).toBe('cards-en')
    expect(cardsIndex('de')).toBe('cards-de')
  })

  it('exposes the required facets as filterable', () => {
    for (const f of ['setCode', 'types', 'subTypes', 'lesson', 'rarity', 'finishes', 'legality', 'cost', 'isOfficial']) {
      expect(CARD_INDEX_SETTINGS.filterableAttributes).toContain(f)
    }
  })

  it('searches name/text/flavor with name first', () => {
    expect(CARD_INDEX_SETTINGS.searchableAttributes?.[0]).toBe('name')
    expect(CARD_INDEX_SETTINGS.searchableAttributes).toEqual(['name', 'text', 'flavorText'])
  })

  it('exposes numberSort as sortable so card numbers order numerically', () => {
    expect(CARD_INDEX_SETTINGS.sortableAttributes).toContain('numberSort')
  })
})

describe('cardNumberSortKey', () => {
  it('orders numeric card numbers numerically, not lexicographically', () => {
    const numbers = ['10', '2', '1', '100', '20', '3', '11']
    const sorted = [...numbers].sort((a, b) =>
      cardNumberSortKey(a) < cardNumberSortKey(b) ? -1 : 1,
    )
    expect(sorted).toEqual(['1', '2', '3', '10', '11', '20', '100'])
  })

  it('orders lettered suffixes after their base number', () => {
    const numbers = ['10b', '3a', '10a', '3b', '4', '3']
    const sorted = [...numbers].sort((a, b) =>
      cardNumberSortKey(a) < cardNumberSortKey(b) ? -1 : 1,
    )
    expect(sorted).toEqual(['3', '3a', '3b', '4', '10a', '10b'])
  })

  it('sorts numbers lacking a numeric prefix after all numbered cards', () => {
    const numbers = ['P1', '2', '10', 'A']
    const sorted = [...numbers].sort((a, b) =>
      cardNumberSortKey(a) < cardNumberSortKey(b) ? -1 : 1,
    )
    expect(sorted).toEqual(['2', '10', 'A', 'P1'])
  })
})

describe('buildCardDocument', () => {
  it('carries orientation and image version onto the built document', () => {
    const data = {
      id: 'bs-1', setCode: 'BS', number: '1', name: 'Harry',
      lesson: null, rarity: null, finishes: [], legality: null, cost: null, damage: null,
      isOfficial: true, types: ['character'], subTypes: [], defaultLanguage: 'en',
      orientation: 'horizontal',
      localizations: { en: { name: 'Harry', text: null, flavorText: null, imageVersion: 42 } },
    }
    const doc = buildCardDocument(data, 'en')
    expect(doc.orientation).toBe('horizontal')
    expect(doc.imageLang).toBe('en')
    expect(doc.imageVersion).toBe(42)
  })

  it('reports no image version when the language has none', () => {
    const data = {
      id: 'bs-2', setCode: 'BS', number: '2', name: 'Ron',
      lesson: null, rarity: null, finishes: [], legality: null, cost: null, damage: null,
      isOfficial: true, types: ['character'], subTypes: [], defaultLanguage: 'en',
      orientation: null,
      localizations: { en: { name: 'Ron', text: null, flavorText: null, imageVersion: null } },
    }
    const doc = buildCardDocument(data, 'en')
    expect(doc.imageLang).toBeNull()
    expect(doc.imageVersion).toBeNull()
  })
})
