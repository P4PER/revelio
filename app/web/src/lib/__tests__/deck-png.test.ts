import { it, expect } from 'vitest'
import type { DeckCardView } from '@revelio/core'
import { layoutDeckSheet, computeSheetGeometry } from '../deck-png'

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

const cell = (cardId: string): import('../deck-png').DeckPngCard => ({
  cardId, quantity: 1, name: cardId, setCode: 'BS', imageVersion: 1, orientation: null,
})

it('positions a single-card section and sizes the canvas to fit', () => {
  const geom = computeSheetGeometry({
    title: 'D',
    sections: [{ title: 'Character', color: '#E8B23A', cards: [cell('a')] }],
  })
  expect(geom.width).toBe(980)
  // content top = PADDING(36)+TITLE_HEIGHT(48)=84; header 84; gridTop 114
  expect(geom.sections[0].headerY).toBe(84)
  expect(geom.sections[0].cards[0]).toEqual({ card: cell('a'), x: 36, y: 114 })
  // gridH = 185; y = 114+185+16 = 315; height = 315 - 16 + 36 = 335
  expect(geom.height).toBe(335)
})

it('wraps cards past COLS onto the next row', () => {
  const cards = Array.from({ length: 7 }, (_, i) => cell(`c${i}`))
  const geom = computeSheetGeometry({
    title: 'D',
    sections: [{ title: 'Charms (7)', color: '#0069A9', cards }],
  })
  // 6 columns → 7th card (index 6) is row 1, col 0
  expect(geom.sections[0].cards[6]).toEqual({ card: cards[6], x: 36, y: 311 }) // 114 + (185+12)
  // rows=2 → gridH = 2*185 + 12 = 382; y = 114+382+16 = 512; height = 512-16+36 = 532
  expect(geom.height).toBe(532)
})

it('advances past a header-only section (Main deck heading with no cards)', () => {
  const geom = computeSheetGeometry({
    title: 'D',
    sections: [
      { title: 'Main deck (4)', color: '#E8B23A', cards: [] },
      { title: 'Charms (4)', color: '#0069A9', cards: [cell('a')] },
    ],
  })
  expect(geom.sections[0].headerY).toBe(84)
  // header-only: gridTop 114, gridH 0, y = 114+0+16 = 130 → next headerY 130
  expect(geom.sections[1].headerY).toBe(130)
  expect(geom.sections[1].cards[0]).toEqual({ card: cell('a'), x: 36, y: 160 }) // 130+30
})
