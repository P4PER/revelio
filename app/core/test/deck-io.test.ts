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
      { cardId: 'HARRY', zone: 'character', quantity: 1, name: 'Harry Potter', cost: null, damage: null, setCode: 'BS', number: '1', lesson: null, isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: true },
      { cardId: 'da-accio', zone: 'main', quantity: 4, name: 'Accio', cost: 2, damage: null, setCode: 'DA', number: '12', lesson: 'charms', isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false },
    ]
    const text = toText({ name: 'Charms Aggro', format: 'revival' }, views)
    expect(text).toContain('// Charms Aggro (Revival)')
    expect(text).toContain('// Character\nHarry Potter (BS 1)')
    expect(text).toContain('// Main deck (4)')
    expect(text).toContain('4x Accio (DA 12)')
  })
})

describe('text import', () => {
  it('parses "4x Accio (DA 12)", "4x Accio (DA)" and "4 Accio"', () => {
    const { lines, unparsed } = parseText('4x Accio (DA 12)\n4x Accio (DA)\n4 Accio\n\n# comment')
    expect(lines).toContainEqual({ quantity: 4, name: 'Accio', setCode: 'DA', number: '12', zone: 'main' })
    expect(lines).toContainEqual({ quantity: 4, name: 'Accio', setCode: 'DA', number: null, zone: 'main' })
    expect(lines).toContainEqual({ quantity: 4, name: 'Accio', setCode: null, number: null, zone: 'main' })
    expect(unparsed).toEqual([])
  })
  it('assigns the starting character (with its number) from a "// Character" section', () => {
    const { lines, unparsed } = parseText(
      '// Charms Aggro (Revival)\n\n// Character\nHermione Granger (BS 9)\n\n// Main deck (4)\n4x Accio (DA 12)\n\n// Sideboard (2)\n2x Lumos (BS 5)',
    )
    expect(lines).toContainEqual({ quantity: 1, name: 'Hermione Granger', setCode: 'BS', number: '9', zone: 'character' })
    expect(lines).toContainEqual({ quantity: 4, name: 'Accio', setCode: 'DA', number: '12', zone: 'main' })
    expect(lines).toContainEqual({ quantity: 2, name: 'Lumos', setCode: 'BS', number: '5', zone: 'sideboard' })
    expect(unparsed).toEqual([])
  })
  it('collects unparseable lines', () => {
    const { lines, unparsed } = parseText('gibberish without a count')
    expect(lines).toEqual([])
    expect(unparsed).toEqual(['gibberish without a count'])
  })
})
