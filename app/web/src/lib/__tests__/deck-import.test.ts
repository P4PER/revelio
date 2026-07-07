import { it, expect } from 'vitest'
import type { DeckCardView, DeckJson, ParsedTextLine } from '@revelio/core'
import { jsonToEntries, resolveKey, textLinesToEntries } from '../deck-import'

type CardViewMeta = Omit<DeckCardView, 'zone' | 'quantity'>

const accioView: CardViewMeta = {
  cardId: 'bs-accio', name: 'Accio', cost: 1, setCode: 'BS', number: '1', lesson: 'charms',
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
}
const harryView: CardViewMeta = {
  cardId: 'bs-harry', name: 'Harry Potter', cost: null, setCode: 'BS', number: '2', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: true,
}

it('jsonToEntries builds character/main/sideboard entries from view metadata', () => {
  const deck: DeckJson = {
    name: 'My Deck', format: 'revival', character: 'bs-harry',
    main: [{ cardId: 'bs-accio', quantity: 4 }],
    sideboard: [{ cardId: 'bs-accio', quantity: 1 }],
  }
  const { entries, missingIds } = jsonToEntries(deck, { 'bs-harry': harryView, 'bs-accio': accioView })

  expect(missingIds).toEqual([])
  expect(entries).toEqual([
    { ...harryView, zone: 'character', quantity: 1 },
    { ...accioView, zone: 'main', quantity: 4 },
    { ...accioView, zone: 'sideboard', quantity: 1 },
  ])
})

it('jsonToEntries reports cardIds with no matching view instead of dropping them', () => {
  const deck: DeckJson = {
    name: 'My Deck', format: 'revival', character: null,
    main: [{ cardId: 'ghost-card', quantity: 2 }, { cardId: 'bs-accio', quantity: 1 }],
    sideboard: [],
  }
  const { entries, missingIds } = jsonToEntries(deck, { 'bs-accio': accioView })

  expect(missingIds).toEqual(['ghost-card'])
  expect(entries).toEqual([{ ...accioView, zone: 'main', quantity: 1 }])
})

it('resolveKey matches the @revelio/db resolveCardsByName key format', () => {
  expect(resolveKey('Accio', null, null)).toBe('accio||')
  expect(resolveKey('Dobby', 'PR', null)).toBe('dobby|PR|')
  expect(resolveKey('Hermione Granger', 'BS', '9')).toBe('hermione granger|BS|9')
})

it('textLinesToEntries maps resolved lines to their zone and merges duplicates in the same zone', () => {
  const lines: ParsedTextLine[] = [
    { quantity: 2, name: 'Accio', setCode: null, number: null, zone: 'main' },
    { quantity: 2, name: 'Accio', setCode: null, number: null, zone: 'main' },
  ]
  const resolved = { 'accio||': 'bs-accio' }
  const { entries, unresolved } = textLinesToEntries(lines, resolved, { 'bs-accio': accioView })

  expect(unresolved).toEqual([])
  expect(entries).toEqual([{ ...accioView, zone: 'main', quantity: 4 }])
})

it('textLinesToEntries places a character-zone line (resolved by set+number) in the character zone', () => {
  const lines: ParsedTextLine[] = [
    { quantity: 1, name: 'Harry Potter', setCode: 'BS', number: '2', zone: 'character' },
    { quantity: 4, name: 'Accio', setCode: 'BS', number: '1', zone: 'main' },
  ]
  const resolved = { 'harry potter|BS|2': 'bs-harry', 'accio|BS|1': 'bs-accio' }
  const { entries, unresolved } = textLinesToEntries(lines, resolved, { 'bs-harry': harryView, 'bs-accio': accioView })

  expect(unresolved).toEqual([])
  expect(entries).toEqual([
    { ...harryView, zone: 'character', quantity: 1 },
    { ...accioView, zone: 'main', quantity: 4 },
  ])
})

it('textLinesToEntries surfaces unresolved (missing/ambiguous) and viewless lines instead of dropping them', () => {
  const lines: ParsedTextLine[] = [
    { quantity: 1, name: 'Nimbus 9000', setCode: null, number: null, zone: 'main' }, // never resolved
    { quantity: 1, name: 'Dobby', setCode: null, number: null, zone: 'main' }, // resolves to null (ambiguous)
    { quantity: 1, name: 'Ghost Card', setCode: null, number: null, zone: 'main' }, // resolves but has no view
    { quantity: 3, name: 'Accio', setCode: null, number: null, zone: 'main' },
  ]
  const resolved = { 'dobby||': null, 'ghost card||': 'ghost-id', 'accio||': 'bs-accio' }
  const { entries, unresolved } = textLinesToEntries(lines, resolved, { 'bs-accio': accioView })

  expect(entries).toEqual([{ ...accioView, zone: 'main', quantity: 3 }])
  expect(unresolved).toEqual([
    { quantity: 1, name: 'Nimbus 9000', setCode: null, number: null, zone: 'main' },
    { quantity: 1, name: 'Dobby', setCode: null, number: null, zone: 'main' },
    { quantity: 1, name: 'Ghost Card', setCode: null, number: null, zone: 'main' },
  ])
})
