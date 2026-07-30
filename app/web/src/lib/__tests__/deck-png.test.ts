import { it, expect } from 'vitest'
import type { DeckCardView } from '@revelio/core'
import { layoutDeckSheet } from '../deck-png'

const harry: DeckCardView = {
  cardId: 'bs-harry', zone: 'character', quantity: 1,
  name: 'Harry Potter', cost: null, setCode: 'BS', number: '1', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: true,
  imageVersion: 100, orientation: 'horizontal',
}
const accio: DeckCardView = {
  cardId: 'bs-accio', zone: 'main', quantity: 4,
  name: 'Accio', cost: 1, setCode: 'BS', number: '2', lesson: 'charms',
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
  imageVersion: 101, orientation: null,
}
const charmsLesson: DeckCardView = {
  cardId: 'bs-charms-class', zone: 'main', quantity: 6,
  name: 'Charms Class', cost: null, setCode: 'BS', number: '3', lesson: 'charms',
  isOfficial: true, legality: 'legal', isLesson: true, isStartingCharacter: false,
  imageVersion: 102, orientation: null,
}
const item: DeckCardView = {
  cardId: 'bs-nimbus', zone: 'main', quantity: 2,
  name: 'Nimbus Two Thousand', cost: 2, setCode: 'BS', number: '4', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
  imageVersion: null, orientation: null,
}
const sideCard: DeckCardView = {
  cardId: 'bs-dobby', zone: 'sideboard', quantity: 1,
  name: 'Dobby', cost: 1, setCode: 'BS', number: '5', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
  imageVersion: 103, orientation: null,
}

it('renders a title from deck name and format label', () => {
  const { title } = layoutDeckSheet({ name: 'My Deck', format: 'revival' }, [])
  expect(title).toBe('My Deck (Revival)')
})

it('produces no sections for an empty deck', () => {
  const { sections } = layoutDeckSheet({ name: 'Empty', format: 'classic' }, [])
  expect(sections).toEqual([])
})

it('adds a Character section holding the character card cell', () => {
  const { sections } = layoutDeckSheet({ name: 'D', format: 'revival' }, [harry])
  expect(sections[0]).toEqual({
    title: 'Character', color: '#E8B23A',
    cards: [{ cardId: 'bs-harry', quantity: 1, name: 'Harry Potter', setCode: 'BS', imageVersion: 100, orientation: 'horizontal' }],
  })
})

it('groups the main zone into a heading plus lesson/type buckets, and lists the sideboard flat', () => {
  const { sections } = layoutDeckSheet(
    { name: 'D', format: 'revival' },
    [harry, accio, charmsLesson, item, sideCard],
  )

  expect(sections).toEqual([
    { title: 'Character', color: '#E8B23A', cards: [{ cardId: 'bs-harry', quantity: 1, name: 'Harry Potter', setCode: 'BS', imageVersion: 100, orientation: 'horizontal' }] },
    { title: 'Main deck (12)', color: '#E8B23A', cards: [] },
    { title: 'Charms (4)', color: '#0069A9', cards: [{ cardId: 'bs-accio', quantity: 4, name: 'Accio', setCode: 'BS', imageVersion: 101, orientation: null }] },
    { title: 'Lessons (6)', color: '#E8B23A', cards: [{ cardId: 'bs-charms-class', quantity: 6, name: 'Charms Class', setCode: 'BS', imageVersion: 102, orientation: null }] },
    { title: 'Items (2)', color: '#8C88A8', cards: [{ cardId: 'bs-nimbus', quantity: 2, name: 'Nimbus Two Thousand', setCode: 'BS', imageVersion: null, orientation: null }] },
    { title: 'Sideboard (1)', color: '#E8B23A', cards: [{ cardId: 'bs-dobby', quantity: 1, name: 'Dobby', setCode: 'BS', imageVersion: 103, orientation: null }] },
  ])
})

it('omits Main deck / Sideboard sections entirely when those zones are empty', () => {
  const { sections } = layoutDeckSheet({ name: 'D', format: 'classic' }, [harry])
  expect(sections.map((s) => s.title)).toEqual(['Character'])
})
