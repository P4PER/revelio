import { it, expect } from 'vitest'
import type { DeckCardView } from '@revelio/core'
import { layoutDeckSheet, computeSheetGeometry } from '../deck-png'

const harry: DeckCardView = {
  cardId: 'bs-harry', zone: 'character', quantity: 1, types: ['character'],
  name: 'Harry Potter', cost: null, setCode: 'BS', number: '1', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: true,
  imageVersion: 100, orientation: 'horizontal',
}
const accio: DeckCardView = {
  cardId: 'bs-accio', zone: 'main', quantity: 4, types: ['spell'],
  name: 'Accio', cost: 1, setCode: 'BS', number: '2', lesson: 'charms',
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
  imageVersion: 101, orientation: null,
}
const charmsLesson: DeckCardView = {
  cardId: 'bs-charms-class', zone: 'main', quantity: 6, types: ['lesson'],
  name: 'Charms Class', cost: null, setCode: 'BS', number: '3', lesson: 'charms',
  isOfficial: true, legality: 'legal', isLesson: true, isStartingCharacter: false,
  imageVersion: 102, orientation: null,
}
const item: DeckCardView = {
  cardId: 'bs-nimbus', zone: 'main', quantity: 2, types: ['item'],
  name: 'Nimbus Two Thousand', cost: 2, setCode: 'BS', number: '4', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
  imageVersion: null, orientation: null,
}
const sideCard: DeckCardView = {
  cardId: 'bs-dobby', zone: 'sideboard', quantity: 1, types: ['item'],
  name: 'Dobby', cost: 1, setCode: 'BS', number: '5', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
  imageVersion: 103, orientation: null,
}

const labels = {
  formatLabel: { classic: 'Classic', revival: 'Revival' },
  character: 'Character',
  mainDeck: 'Main deck',
  sideboard: 'Sideboard',
  group: (k: string): string => ({ spell: 'Spells', item: 'Items', lesson: 'Lessons' } as Record<string, string>)[k] ?? k,
}

it('renders a title from deck name and format label', () => {
  const { title } = layoutDeckSheet({ name: 'My Deck', format: 'revival' }, [], labels)
  expect(title).toBe('My Deck (Revival)')
})

it('produces no sections for an empty deck', () => {
  const { sections } = layoutDeckSheet({ name: 'Empty', format: 'classic' }, [], labels)
  expect(sections).toEqual([])
})

it('adds a Character section holding the character card cell', () => {
  const { sections } = layoutDeckSheet({ name: 'D', format: 'revival' }, [harry], labels)
  expect(sections[0]).toEqual({
    title: 'Character', color: '#E8B23A',
    cards: [{ cardId: 'bs-harry', quantity: 1, name: 'Harry Potter', setCode: 'BS', imageVersion: 100, orientation: 'horizontal' }],
  })
})

it('groups the main zone into a heading plus lesson/type buckets, and lists the sideboard flat', () => {
  const { sections } = layoutDeckSheet(
    { name: 'D', format: 'revival' },
    [harry, accio, charmsLesson, item, sideCard],
    labels,
  )

  expect(sections).toEqual([
    { title: 'Character', color: '#E8B23A', cards: [{ cardId: 'bs-harry', quantity: 1, name: 'Harry Potter', setCode: 'BS', imageVersion: 100, orientation: 'horizontal' }] },
    { title: 'Main deck (12)', color: '#E8B23A', cards: [] },
    { title: 'Spells (4)', color: '#8C88A8', cards: [{ cardId: 'bs-accio', quantity: 4, name: 'Accio', setCode: 'BS', imageVersion: 101, orientation: null }] },
    { title: 'Items (2)', color: '#8C88A8', cards: [{ cardId: 'bs-nimbus', quantity: 2, name: 'Nimbus Two Thousand', setCode: 'BS', imageVersion: null, orientation: null }] },
    { title: 'Lessons (6)', color: '#E8B23A', cards: [{ cardId: 'bs-charms-class', quantity: 6, name: 'Charms Class', setCode: 'BS', imageVersion: 102, orientation: null }] },
    { title: 'Sideboard (1)', color: '#E8B23A', cards: [{ cardId: 'bs-dobby', quantity: 1, name: 'Dobby', setCode: 'BS', imageVersion: 103, orientation: null }] },
  ])
})

it('omits Main deck / Sideboard sections entirely when those zones are empty', () => {
  const { sections } = layoutDeckSheet({ name: 'D', format: 'classic' }, [harry], labels)
  expect(sections.map((s) => s.title)).toEqual(['Character'])
})

const cell = (cardId: string): import('../deck-png').DeckPngCard => ({
  cardId, quantity: 1, name: cardId, setCode: 'BS', imageVersion: 1, orientation: null,
})
const hcell = (cardId: string): import('../deck-png').DeckPngCard => ({
  cardId, quantity: 1, name: cardId, setCode: 'BS', imageVersion: 1, orientation: 'horizontal',
})

it('positions a single-card section and sizes the canvas to fit', () => {
  const geom = computeSheetGeometry({
    title: 'D',
    sections: [{ title: 'Character', color: '#E8B23A', cards: [cell('a')] }],
  })
  expect(geom.width).toBe(980)
  // content top = PADDING(36)+TITLE_HEIGHT(48)=84; header 84; gridTop 114
  expect(geom.sections[0].headerY).toBe(84)
  expect(geom.sections[0].cards[0]).toEqual({ card: cell('a'), x: 36, y: 114, w: 132, h: 185 })
  // gridH = 185; y = 114+185+16 = 315; height = 315 - 16 + 36 = 335
  expect(geom.height).toBe(335)
})

it('renders a horizontal card as a landscape box centered in the row', () => {
  const geom = computeSheetGeometry({
    title: 'D',
    sections: [{ title: 'Character', color: '#E8B23A', cards: [hcell('a')] }],
  })
  // landscape box THUMB_H×THUMB_W = 185×132; vertically centered: 114 + round((185-132)/2) = 141
  expect(geom.sections[0].cards[0]).toEqual({ card: hcell('a'), x: 36, y: 141, w: 185, h: 132 })
  expect(geom.height).toBe(335)
})

it('packs adjacent horizontal cards tightly with one gap between them', () => {
  const geom = computeSheetGeometry({
    title: 'D',
    sections: [{ title: 'Locations (2)', color: '#8C88A8', cards: [hcell('a'), hcell('b')] }],
  })
  // second card starts one GRID_GAP after the first: 36 + 185 + 12 = 233
  expect(geom.sections[0].cards[1].x).toBe(233)
})

it('wraps cards that overflow the content width onto the next row', () => {
  const cards = Array.from({ length: 7 }, (_, i) => cell(`c${i}`))
  const geom = computeSheetGeometry({
    title: 'D',
    sections: [{ title: 'Spells (7)', color: '#8C88A8', cards }],
  })
  // 6 portrait cards (pitch 144) fill row 1; the 7th wraps to row 2, col 0
  expect(geom.sections[0].cards[6]).toEqual({ card: cards[6], x: 36, y: 325, w: 132, h: 185 }) // 114 + (185+26)
  // rows=2 → gridH = 2*185 + 26 = 396; y = 114+396+16 = 526; height = 526-16+36 = 546
  expect(geom.height).toBe(546)
})

it('wraps a horizontal card that would overflow the content width', () => {
  // six portrait cards fill row 1 (cursor at 900); a horizontal (185 wide) won't
  // fit in the remaining width, so it wraps to row 2.
  const cards = [cell('v0'), cell('v1'), cell('v2'), cell('v3'), cell('v4'), cell('v5'), hcell('h')]
  const geom = computeSheetGeometry({
    title: 'D',
    sections: [{ title: 'Main', color: '#8C88A8', cards }],
  })
  expect(geom.sections[0].cards[6]).toEqual({ card: hcell('h'), x: 36, y: 352, w: 185, h: 132 }) // row2 top 325 + 27
})

it('advances past a header-only section (Main deck heading with no cards)', () => {
  const geom = computeSheetGeometry({
    title: 'D',
    sections: [
      { title: 'Main deck (4)', color: '#E8B23A', cards: [] },
      { title: 'Spells (4)', color: '#8C88A8', cards: [cell('a')] },
    ],
  })
  expect(geom.sections[0].headerY).toBe(84)
  // header-only: gridTop 114, gridH 0, y = 114+0+16 = 130 → next headerY 130
  expect(geom.sections[1].headerY).toBe(130)
  expect(geom.sections[1].cards[0]).toEqual({ card: cell('a'), x: 36, y: 160, w: 132, h: 185 }) // 130+30
})
