import { describe, it, expect } from 'vitest'
import type { DeckCardView } from '../src/domain.js'
import { DECK_SHEET, layoutDeckSheet, computeSheetGeometry, type DeckSheetCard } from '../src/deck-sheet.js'
import { OTHER_GROUP, SHEET_LOCALES, sheetLabels } from '../src/index.js'
import { DeckSheetRequest, MAX_SHEET_ENTRIES, SHEET_FIELD_LIMITS, pickSheetEntries, type DeckSheetEntry } from '../src/index.js'

const harry: DeckCardView = {
  cardId: 'bs-harry', zone: 'character', quantity: 1, types: ['character'],
  name: 'Harry Potter', cost: null, damage: null, setCode: 'BS', number: '1', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: true,
  imageVersion: 100, orientation: 'horizontal', artCropVersion: null,
}
const accio: DeckCardView = {
  cardId: 'bs-accio', zone: 'main', quantity: 4, types: ['spell'],
  name: 'Accio', cost: 1, damage: null, setCode: 'BS', number: '2', lesson: 'charms',
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
  imageVersion: 101, orientation: null, artCropVersion: null,
}
const charmsLesson: DeckCardView = {
  cardId: 'bs-charms-class', zone: 'main', quantity: 6, types: ['lesson'],
  name: 'Charms Class', cost: null, damage: null, setCode: 'BS', number: '3', lesson: 'charms',
  isOfficial: true, legality: 'legal', isLesson: true, isStartingCharacter: false,
  imageVersion: 102, orientation: null, artCropVersion: null,
}
const item: DeckCardView = {
  cardId: 'bs-nimbus', zone: 'main', quantity: 2, types: ['item'],
  name: 'Nimbus Two Thousand', cost: 2, damage: null, setCode: 'BS', number: '4', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
  imageVersion: null, orientation: null, artCropVersion: null,
}
const sideCard: DeckCardView = {
  cardId: 'bs-dobby', zone: 'sideboard', quantity: 1, types: ['item'],
  name: 'Dobby', cost: 1, damage: null, setCode: 'BS', number: '5', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: false,
  imageVersion: 103, orientation: null, artCropVersion: null,
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

const cell = (cardId: string): DeckSheetCard => ({
  cardId, quantity: 1, name: cardId, setCode: 'BS', imageVersion: 1, orientation: null,
})
const hcell = (cardId: string): DeckSheetCard => ({
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

describe('sheetLabels', () => {
  it('resolves every label the sheet layout asks for', () => {
    const en = sheetLabels('en')
    expect(en.formatLabel).toEqual({ classic: 'Classic', revival: 'Revival' })
    expect(en.character).toBe('Character')
    expect(en.mainDeck).toBe('Main deck')
    expect(en.sideboard).toBe('Sideboard')
    expect(en.group('creature')).toBe('Creatures')
    expect(en.group('lesson')).toBe('Lessons')
    expect(en.group(OTHER_GROUP)).toBe('Other')
  })

  it('resolves German too', () => {
    const de = sheetLabels('de')
    expect(de.mainDeck).toBe('Hauptdeck')
    expect(de.group('creature')).toBe('Kreaturen')
    expect(de.group(OTHER_GROUP)).toBe('Sonstige')
  })

  // An unknown locale must not render a sheet full of raw keys.
  it('falls back to English for an unknown locale', () => {
    expect(sheetLabels('fr').mainDeck).toBe('Main deck')
  })

  it('lists the locales the sheet contract accepts', () => {
    expect([...SHEET_LOCALES]).toEqual(['en', 'de'])
  })
})

const entry = {
  cardId: 'harry', zone: 'main' as const, quantity: 2, name: 'Harry Potter',
  setCode: 'base', types: ['character'], imageVersion: 3, orientation: null,
}
const body = { locale: 'en', deck: { name: 'Charms Aggro', format: 'classic' }, entries: [entry] }

describe('DeckSheetRequest', () => {
  it('accepts a minimal sheet request', () => {
    const parsed = DeckSheetRequest.parse(body)
    expect(parsed.entries[0].cardId).toBe('harry')
    expect(parsed.maxBytes).toBeUndefined()
  })

  it('rejects a locale the sheet has no labels for', () => {
    expect(DeckSheetRequest.safeParse({ ...body, locale: 'fr' }).success).toBe(false)
  })

  it('rejects an empty deck and one past the entry cap', () => {
    expect(DeckSheetRequest.safeParse({ ...body, entries: [] }).success).toBe(false)
    const tooMany = Array.from({ length: MAX_SHEET_ENTRIES + 1 }, (_, i) => ({ ...entry, cardId: `c${i}` }))
    expect(DeckSheetRequest.safeParse({ ...body, entries: tooMany }).success).toBe(false)
  })

  it('strips fields that do not reach a pixel', () => {
    // DeckCardView carries cost/damage/legality; none of them is painted, and
    // every extra field would widen the cache key for nothing.
    const parsed = DeckSheetRequest.parse({ ...body, entries: [{ ...entry, cost: 4, legality: 'legal' }] })
    expect(parsed.entries[0]).not.toHaveProperty('cost')
    expect(parsed.entries[0]).not.toHaveProperty('legality')
  })

  it('pickSheetEntries keeps exactly the painted fields', () => {
    const view = { ...entry, cost: 4, damage: null, lesson: null, isOfficial: true, legality: 'legal' }
    expect(pickSheetEntries([view])).toEqual([entry])
  })

  // A deck name is user input and reaches Pango, which honours newlines: enough
  // of them grow the title layer past the canvas and sharp rejects the whole
  // composite, so that deck's sheet 500s forever. Collapsing beats rejecting -
  // the user gets their picture, and Phase 4 gets one cache key for one name.
  it('collapses whitespace and control characters in every painted string', () => {
    const parsed = DeckSheetRequest.parse({
      ...body,
      deck: { ...body.deck, name: 'Line one\nLine two\tand\u0000more' },
      entries: [{ ...entry, name: '  Harry   Potter  ' }],
    })
    expect(parsed.deck.name).toBe('Line one Line two and more')
    expect(parsed.entries[0].name).toBe('Harry Potter')
  })

  it('rejects a name that is nothing but whitespace', () => {
    expect(DeckSheetRequest.safeParse({ ...body, deck: { ...body.deck, name: '   ' } }).success).toBe(false)
    expect(DeckSheetRequest.safeParse({ ...body, entries: [{ ...entry, name: '\n\t ' }] }).success).toBe(false)
  })

  // The id is interpolated into the art URL's path, so it is an allowlist and
  // not a length limit. The charset and the ceiling come from the dataset: 2196
  // cards across en and de, longest id 49, every one of them [a-z0-9-].
  it('accepts the card ids the dataset uses and rejects anything else', () => {
    for (const cardId of ['bs-1-dean-thomas', 'bs-3a-draco-malfoy', 'c1', 'x'.repeat(SHEET_FIELD_LIMITS.cardId)]) {
      expect(DeckSheetRequest.safeParse({ ...body, entries: [{ ...entry, cardId }] }).success, cardId).toBe(true)
    }
    for (const cardId of ['../../../secret', 'a/b', 'BS-1', 'a b', '-leading', 'a.b', '', 'x'.repeat(SHEET_FIELD_LIMITS.cardId + 1)]) {
      expect(DeckSheetRequest.safeParse({ ...body, entries: [{ ...entry, cardId }] }).success, cardId).toBe(false)
    }
  })

  // Every ceiling here is measured against the dataset plus headroom, not a
  // round number: the maxima used to sit 2x to 67x past anything real, which is
  // what let a legal request outgrow the service's body cap.
  it('caps the painted fields where the data actually sits', () => {
    const ok = (over: Record<string, unknown>) =>
      DeckSheetRequest.safeParse({ ...body, entries: [{ ...entry, ...over }] }).success
    expect(ok({ name: 'x'.repeat(120) })).toBe(true)
    expect(ok({ name: 'x'.repeat(121) })).toBe(false)
    expect(ok({ setCode: 'x'.repeat(10) })).toBe(true)
    expect(ok({ setCode: 'x'.repeat(11) })).toBe(false)
    expect(ok({ types: ['a', 'b', 'c', 'd'] })).toBe(true)
    expect(ok({ types: ['a', 'b', 'c', 'd', 'e'] })).toBe(false)
    expect(ok({ types: ['x'.repeat(21)] })).toBe(false)
  })

  // web's own deck writer caps the name at 120 (lib/actions/deck-actions.ts).
  // Two independent limits on one value is how they drift apart.
  it('caps the deck name where web caps it', () => {
    const name = (n: number) => DeckSheetRequest.safeParse({ ...body, deck: { ...body.deck, name: 'x'.repeat(n) } }).success
    expect(name(120)).toBe(true)
    expect(name(121)).toBe(false)
  })

  // layoutDeckSheet takes DeckSheetEntry[]; a parsed request must be usable as
  // one without a cast, or the contract and the layout have drifted apart.
  it('parses into the type the layout takes', () => {
    const parsed = DeckSheetRequest.parse(body)
    const entries: DeckSheetEntry[] = parsed.entries
    expect(computeSheetGeometry(layoutDeckSheet(parsed.deck, entries, sheetLabels('en'))).width).toBe(DECK_SHEET.width)
  })
})
