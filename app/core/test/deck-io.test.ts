import { describe, it, expect } from 'vitest'
import { toJson, parseJson, toText, parseText } from '../src/deck-io.js'
import type { DeckDTO, DeckCardView } from '../src/domain.js'

const deck: DeckDTO = {
  id: 'd1', name: 'Charms Aggro', format: 'revival', visibility: 'private',
  createdAt: '', updatedAt: '',
  cards: [
    { cardId: 'HARRY', zone: 'character', quantity: 1 },
    { cardId: 'da-accio', zone: 'main', quantity: 4 },
    { cardId: 'bs-lumos', zone: 'sideboard', quantity: 2 },
  ],
}

describe('json round-trip', () => {
  it('exports then re-parses to the same shape', () => {
    const json = toJson(deck)
    expect(json).toEqual({
      name: 'Charms Aggro', format: 'revival', character: 'HARRY',
      main: [{ cardId: 'da-accio', quantity: 4 }],
      sideboard: [{ cardId: 'bs-lumos', quantity: 2 }],
    })
    expect(parseJson(JSON.parse(JSON.stringify(json)))).toEqual(json)
  })
  it('rejects malformed json', () => {
    expect(() => parseJson({ name: 'x' })).toThrow()
    expect(() => parseJson({ name: 'x', format: 'modern', character: null, main: [], sideboard: [] })).toThrow()
  })
})

describe('text export', () => {
  it('groups by zone with a header and counts', () => {
    const views: DeckCardView[] = [
      { cardId: 'HARRY', zone: 'character', quantity: 1, name: 'Harry Potter', cost: null, setCode: 'BS', number: '1', lesson: null, isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: true },
      { cardId: 'da-accio', zone: 'main', quantity: 4, name: 'Accio', cost: 2, setCode: 'DA', number: '12', lesson: 'charms', isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false },
    ]
    const text = toText({ name: 'Charms Aggro', format: 'revival' }, views)
    expect(text).toContain('# Charms Aggro (Revival)')
    expect(text).toContain('Character: 1x Harry Potter (BS)')
    expect(text).toContain('4x Accio (DA)')
  })
})

describe('text import', () => {
  it('parses "4x Accio (DA)" and "4 Accio"', () => {
    const { lines, unparsed } = parseText('4x Accio (DA)\n4 Accio\n\n# comment')
    expect(lines).toContainEqual({ quantity: 4, name: 'Accio', setCode: 'DA' })
    expect(lines).toContainEqual({ quantity: 4, name: 'Accio', setCode: null })
    expect(unparsed).toEqual([])
  })
  it('collects unparseable lines', () => {
    const { lines, unparsed } = parseText('gibberish without a count')
    expect(lines).toEqual([])
    expect(unparsed).toEqual(['gibberish without a count'])
  })
})
