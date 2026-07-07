import { it, expect } from 'vitest'
import type { DeckCardView } from '@revelio/core'
import { layoutDeckLines } from '../deck-png'

const harry: DeckCardView = {
  cardId: 'bs-harry', zone: 'character', quantity: 1,
  name: 'Harry Potter', cost: null, setCode: 'BS', number: '1', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: true,
}
const accio: DeckCardView = {
  cardId: 'bs-accio', zone: 'main', quantity: 4,
  name: 'Accio', cost: 1, setCode: 'BS', number: '2', lesson: 'charms',
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
}
const charmsLesson: DeckCardView = {
  cardId: 'bs-charms-class', zone: 'main', quantity: 6,
  name: 'Charms Class', cost: null, setCode: 'BS', number: '3', lesson: 'charms',
  isOfficial: true, legality: 'legal', isLesson: true, isStartingCharacter: false,
}
const item: DeckCardView = {
  cardId: 'bs-nimbus', zone: 'main', quantity: 2,
  name: 'Nimbus Two Thousand', cost: 2, setCode: 'BS', number: '4', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
}
const sideCard: DeckCardView = {
  cardId: 'bs-dobby', zone: 'sideboard', quantity: 1,
  name: 'Dobby', cost: 1, setCode: 'BS', number: '5', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
}

it('renders a title from deck name and format label', () => {
  const { title } = layoutDeckLines({ name: 'My Deck', format: 'revival' }, [])
  expect(title).toBe('My Deck (Revival)')
})

it('produces no sections for an empty deck', () => {
  const { sections } = layoutDeckLines({ name: 'Empty', format: 'classic' }, [])
  expect(sections).toEqual([])
})

it('adds a Character section with a single Nx Name (SET) line', () => {
  const { sections } = layoutDeckLines({ name: 'D', format: 'revival' }, [harry])
  expect(sections[0]).toEqual({ title: 'Character', color: '#E8B23A', lines: ['1x Harry Potter (BS)'] })
})

it('groups the main zone into a heading plus lesson/type buckets, and lists the sideboard flat', () => {
  const { sections } = layoutDeckLines(
    { name: 'D', format: 'revival' },
    [harry, accio, charmsLesson, item, sideCard],
  )

  expect(sections).toEqual([
    { title: 'Character', color: '#E8B23A', lines: ['1x Harry Potter (BS)'] },
    { title: 'Main deck (12)', color: '#E8B23A', lines: [] },
    { title: 'Charms (4)', color: '#0069A9', lines: ['4x Accio (BS)'] },
    { title: 'Lessons (6)', color: '#E8B23A', lines: ['6x Charms Class (BS)'] },
    { title: 'Items (2)', color: '#8C88A8', lines: ['2x Nimbus Two Thousand (BS)'] },
    { title: 'Sideboard (1)', color: '#E8B23A', lines: ['1x Dobby (BS)'] },
  ])
})

it('omits Main deck / Sideboard sections entirely when those zones are empty', () => {
  const { sections } = layoutDeckLines({ name: 'D', format: 'classic' }, [harry])
  expect(sections.map((s) => s.title)).toEqual(['Character'])
})
