import { describe, it, expect } from 'vitest'
import type { DeckCardView } from '../src/domain.js'
import {
  DECK_SHEET, DECK_SHEET_COLORS, layoutDeckSheet, computeSheetGeometry, makeupSegments,
  type DeckSheetCard, type DeckSheetLayout,
} from '../src/deck-sheet.js'
import { OTHER_GROUP, SHEET_LOCALES, sheetLabels } from '../src/index.js'
import { DeckSheetRequest, MAX_SHEET_ENTRIES, SHEET_FIELD_LIMITS, pickSheetEntries, type DeckSheetEntry } from '../src/index.js'

const harry: DeckCardView = {
  cardId: 'bs-harry', zone: 'character', quantity: 1, types: ['character'],
  name: 'Harry Potter', cost: null, damage: null, setCode: 'BS', number: '1', lesson: null,
  isOfficial: true, legality: 'legal', isLesson: false, isStartingCharacter: true,
  imageVersion: 100, orientation: 'horizontal', artCropVersion: 1_783_899_940,
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
  mainDeck: 'Main deck',
  sideboard: 'Sideboard',
  cards: 'cards',
  startingCharacter: 'Starting character',
  group: (k: string): string => ({ spell: 'Spells', item: 'Items', lesson: 'Lessons' } as Record<string, string>)[k] ?? k,
}

const card = (v: DeckCardView) => ({
  cardId: v.cardId, quantity: v.quantity, name: v.name, setCode: v.setCode,
  imageVersion: v.imageVersion, orientation: v.orientation ?? null,
})
const full = [harry, accio, charmsLesson, item, sideCard]

describe('layoutDeckSheet', () => {
  it('puts the character in the banner and in no zone', () => {
    const { banner, zones } = layoutDeckSheet({ name: 'D', format: 'revival' }, full, labels)
    expect(banner.character).toEqual({ card: card(harry), label: 'Starting character', artCropVersion: 1_783_899_940 })
    const ids = zones.flatMap((z) => z.groups.flatMap((g) => g.cards.map((c) => c.cardId)))
    expect(ids).not.toContain('bs-harry')
  })

  it('names the deck without the format suffix and counts the main deck in the eyebrow', () => {
    const { banner } = layoutDeckSheet({ name: 'Charms Aggro', format: 'revival' }, full, labels)
    expect(banner.name).toBe('Charms Aggro')
    // The character and the sideboard are not part of the main deck's 12.
    expect(banner.eyebrow).toBe('REVIVAL · 12 CARDS')
  })

  it('builds the makeup from the main zone only, in group order', () => {
    const { banner } = layoutDeckSheet({ name: 'D', format: 'classic' }, full, labels)
    expect(banner.makeup).toEqual([
      { key: 'spell', label: 'Spells', count: 4, color: DECK_SHEET_COLORS.group.spell },
      { key: 'item', label: 'Items', count: 2, color: DECK_SHEET_COLORS.group.item },
      { key: 'lesson', label: 'Lessons', count: 6, color: DECK_SHEET_COLORS.group.lesson },
    ])
  })

  it('groups the main zone by type and lists the sideboard as one untitled group', () => {
    const { zones } = layoutDeckSheet({ name: 'D', format: 'classic' }, full, labels)
    expect(zones).toEqual([
      {
        title: 'MAIN DECK', count: 12, groups: [
          { key: 'spell', title: 'SPELLS', count: 4, color: DECK_SHEET_COLORS.group.spell, cards: [card(accio)] },
          { key: 'item', title: 'ITEMS', count: 2, color: DECK_SHEET_COLORS.group.item, cards: [card(item)] },
          { key: 'lesson', title: 'LESSONS', count: 6, color: DECK_SHEET_COLORS.group.lesson, cards: [card(charmsLesson)] },
        ],
      },
      {
        title: 'SIDEBOARD', count: 1, groups: [
          { key: 'sideboard', title: null, count: 1, color: DECK_SHEET_COLORS.group[OTHER_GROUP], cards: [card(sideCard)] },
        ],
      },
    ])
  })

  it('has no zones and no makeup for a deck that is only a character', () => {
    const { banner, zones } = layoutDeckSheet({ name: 'D', format: 'classic' }, [harry], labels)
    expect(zones).toEqual([])
    expect(banner.makeup).toEqual([])
    expect(banner.eyebrow).toBe('CLASSIC · 0 CARDS')
  })

  it('has no character when the deck has none', () => {
    expect(layoutDeckSheet({ name: 'D', format: 'classic' }, [accio], labels).banner.character).toBeNull()
  })
})

const p = (id: string, quantity = 1): DeckSheetCard => ({ cardId: id, quantity, name: id, setCode: 'BS', imageVersion: 1, orientation: null })
const l = (id: string): DeckSheetCard => ({ ...p(id), orientation: 'horizontal' })
const group = (key: string, cards: DeckSheetCard[], title: string | null = key.toUpperCase()) =>
  ({ key, title, count: cards.length, color: '#000000', cards })
const sheet = (groups: ReturnType<typeof group>[], character: DeckSheetCard | null = null): DeckSheetLayout => ({
  banner: { name: 'D', eyebrow: 'E', makeup: [], character: character && { card: character, label: 'S', artCropVersion: null } },
  zones: [{ title: 'MAIN DECK', count: 0, groups }],
})

describe('computeSheetGeometry', () => {
  it('is 1440 wide with the first zone below the banner', () => {
    const geom = computeSheetGeometry(sheet([group('spell', [p('a')])]))
    expect(geom.width).toBe(1440)
    // banner 320 + zone gap 24
    expect(geom.zones[0].headerY).toBe(344)
    // header 344 + 44 = line top 388; label 22 + gap 10 = cards at 420
    expect(geom.zones[0].groups[0].labelY).toBe(388)
    expect(geom.zones[0].groups[0].cards[0]).toEqual({ card: p('a'), x: 40, y: 420, w: 112, h: 157 })
    // line 420 + 157 - 388 = 189; y = 388 + 189 + 24 = 601; height = 601 - 24 + footer 72
    expect(geom.height).toBe(649)
  })

  it('makes a row of landscape cards only as tall as a landscape card', () => {
    const geom = computeSheetGeometry(sheet([group('creature', [l('a'), l('b')])]))
    expect(geom.zones[0].groups[0].cards[1]).toEqual({ card: l('b'), x: 213, y: 420, w: 157, h: 112 }) // 40 + 157 + 16
    expect(geom.height).toBe(604) // 649 - (157 - 112)
  })

  it('bottom-aligns a landscape card in a row with a portrait one', () => {
    const geom = computeSheetGeometry(sheet([group('item', [p('a'), l('b')])]))
    expect(geom.zones[0].groups[0].cards[1]).toMatchObject({ x: 168, y: 465 }) // 40+112+16; 420+157-112
  })

  it('packs a second group beside the first when it fits', () => {
    const geom = computeSheetGeometry(sheet([group('spell', [p('a'), p('b'), p('c')]), group('item', [p('d')])]))
    // 3 x 112 + 2 x 16 = 368; next group at 40 + 368 + 36
    expect(geom.zones[0].groups[1]).toMatchObject({ x: 444, labelY: 388 })
    expect(geom.zones[0].groups[1].cards[0]).toMatchObject({ x: 444, y: 420 })
  })

  it('starts a new line when the next group does not fit', () => {
    const nine = Array.from({ length: 9 }, (_, i) => p(`s${i}`))
    const geom = computeSheetGeometry(sheet([group('spell', nine), group('item', [p('x'), p('y')])]))
    // 9 cards end at 40 + 1136 = 1176; + 36 = 1212; two cards (240) would end at 1452 > 1400
    // new line top = 388 + 189 + 24 = 601; cards at 601 + 32
    expect(geom.zones[0].groups[1]).toMatchObject({ x: 40, labelY: 601 })
    expect(geom.zones[0].groups[1].cards[0]).toMatchObject({ x: 40, y: 633 })
  })

  it('wraps an oversize group inside itself at ten portrait cards a row', () => {
    const twelve = Array.from({ length: 12 }, (_, i) => p(`s${i}`))
    const geom = computeSheetGeometry(sheet([group('spell', twelve)]))
    // 40 + 10 x 112 + 9 x 16 = 1304 fits; an eleventh would end at 1432 > 1400
    expect(geom.zones[0].groups[0].cards[10]).toMatchObject({ x: 40, y: 597 }) // 420 + 157 + 20
  })

  it('skips the label band for an untitled group', () => {
    const geom = computeSheetGeometry(sheet([group('sideboard', [p('a')], null)]))
    expect(geom.zones[0].groups[0].cards[0].y).toBe(398) // 388 + 10
  })

  it('places the banner card, the text column and the bar', () => {
    const geom = computeSheetGeometry(sheet([group('spell', [p('a')])], l('hero')))
    expect(geom.banner).toEqual({
      art: { x: 560, y: 0, w: 880, h: 320 },
      card: { card: l('hero'), x: 40, y: 40, w: 224, h: 160 },
      textX: 290, textWidth: 640,
      bar: { x: 40, y: 254, w: 1360, h: 10 },
      legendY: 274,
    })
  })

  it('moves the text left and widens it when there is no character', () => {
    const geom = computeSheetGeometry(sheet([group('spell', [p('a')])]))
    expect(geom.banner).toMatchObject({ card: null, textX: 40, textWidth: 1360 })
  })

  it('is banner plus footer for a deck with no zones', () => {
    const geom = computeSheetGeometry({ ...sheet([], l('hero')), zones: [] })
    expect(geom.zones).toEqual([])
    expect(geom.height).toBe(392) // 320 + 72
  })

  it('puts the logo in the footer, right-aligned', () => {
    const geom = computeSheetGeometry(sheet([group('spell', [p('a')])]))
    // 34 tall, 34 x 262 / 78 = 114 wide; centred in the 72px footer of a 649 sheet
    expect(geom.logo).toEqual({ x: 1286, y: 596, w: 114, h: 34 })
  })
})

describe('makeupSegments', () => {
  it('splits the bar by count with 2px gaps and ends flush', () => {
    const segs = makeupSegments(
      [{ key: 'a', label: 'A', count: 3, color: '#111111' }, { key: 'b', label: 'B', count: 1, color: '#222222' }],
      { x: 40, y: 254, w: 1360, h: 10 },
    )
    // free = 1360 - 2 = 1358; round(0.75 x 1358) = 1019; the last takes the rest
    expect(segs).toEqual([
      { x: 40, y: 254, w: 1019, h: 10, color: '#111111' },
      { x: 1061, y: 254, w: 339, h: 10, color: '#222222' },
    ])
  })

  it('draws nothing for an empty main deck', () => {
    expect(makeupSegments([], { x: 40, y: 254, w: 1360, h: 10 })).toEqual([])
  })
})

describe('sheetLabels', () => {
  it('resolves every label the sheet layout asks for', () => {
    const en = sheetLabels('en')
    expect(en.formatLabel).toEqual({ classic: 'Classic', revival: 'Revival' })
    expect(en.cards).toBe('cards')
    expect(en.startingCharacter).toBe('Starting character')
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
    expect(de.cards).toBe('Karten')
    expect(de.startingCharacter).toBe('Startcharakter')
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

  // imageVersion is an image file's mtime in unix seconds (ingest's fileVersion),
  // so every real card carries ten digits. A cap sized for "anything real is six
  // digits" rejected the whole dataset, and every /deck fell back to the list.
  it('accepts the unix-seconds imageVersion every real card carries', () => {
    const parsed = DeckSheetRequest.safeParse({ ...body, entries: [{ ...entry, imageVersion: 1_783_899_473 }] })
    expect(parsed.success).toBe(true)
    // Still bounded, because the service sizes its body cap from the digits.
    expect(DeckSheetRequest.safeParse({
      ...body, entries: [{ ...entry, imageVersion: SHEET_FIELD_LIMITS.imageVersion + 1 }],
    }).success).toBe(false)
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
    const view = { ...entry, artCropVersion: null, cost: 4, damage: null, lesson: null, isOfficial: true, legality: 'legal' }
    expect(pickSheetEntries([view])).toEqual([{ ...entry, artCropVersion: null }])
  })

  // Only the banner reads it, and the banner only draws the character. Sending a
  // version for every card would widen the request for bytes nothing paints.
  it('pickSheetEntries sends the art crop for the character only', () => {
    const character = { ...entry, zone: 'character' as const, artCropVersion: 1_783_899_940 }
    const main = { ...entry, cardId: 'other', artCropVersion: 1_783_899_940 }
    expect(pickSheetEntries([character, main]).map((e) => e.artCropVersion)).toEqual([1_783_899_940, null])
  })

  // Optional on the wire so a new service accepts an old caller's body, and
  // bounded like imageVersion because it is the same kind of value.
  it('defaults artCropVersion to null and bounds it like imageVersion', () => {
    expect(DeckSheetRequest.parse(body).entries[0].artCropVersion).toBeNull()
    const ok = (artCropVersion: unknown) =>
      DeckSheetRequest.safeParse({ ...body, entries: [{ ...entry, artCropVersion }] }).success
    expect(ok(1_783_899_940)).toBe(true)
    expect(ok(null)).toBe(true)
    expect(ok(-1)).toBe(false)
    expect(ok(1.5)).toBe(false)
    expect(ok(SHEET_FIELD_LIMITS.imageVersion + 1)).toBe(false)
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
    const L = SHEET_FIELD_LIMITS
    const ok = (over: Record<string, unknown>) =>
      DeckSheetRequest.safeParse({ ...body, entries: [{ ...entry, ...over }] }).success
    expect(ok({ name: 'x'.repeat(L.nameInput) })).toBe(true)
    expect(ok({ name: 'x'.repeat(L.nameInput + 1) })).toBe(false)
    expect(ok({ types: Array.from({ length: L.types }, () => 'spell') })).toBe(true)
    expect(ok({ types: Array.from({ length: L.types + 1 }, () => 'spell') })).toBe(false)
    expect(ok({ types: ['x'.repeat(L.typeLength + 1)] })).toBe(false)
  })

  // A name longer than the sheet paints is not an error: fitText already
  // ellipsizes to the card box, so rejecting one would turn a cosmetic overflow
  // into "this deck has no picture, ever". Nothing upstream enforces a length -
  // duplicateDeckAction appends " (copy)" straight past web's own writer schema,
  // and a localized card name is saved with no max at all - so the contract
  // truncates what it cannot paint and only rejects what it cannot carry.
  it('truncates a name past the painted length instead of rejecting it', () => {
    const long = `${'x'.repeat(119)}y${'z'.repeat(60)}`
    const parsed = DeckSheetRequest.parse({
      ...body,
      deck: { ...body.deck, name: long },
      entries: [{ ...entry, name: long }],
    })
    expect(parsed.deck.name).toBe(`${'x'.repeat(119)}y`)
    expect(parsed.entries[0].name).toHaveLength(SHEET_FIELD_LIMITS.name)
  })

  // The real case: duplicating a 120-character deck gives a 127-character copy,
  // and duplicating that one grows it again.
  it('renders a deck whose name grew past the limit through duplication', () => {
    let name = 'x'.repeat(SHEET_FIELD_LIMITS.name)
    for (let i = 0; i < 6; i++) name = `${name} (copy)`
    expect(DeckSheetRequest.safeParse({ ...body, deck: { ...body.deck, name } }).success).toBe(true)
  })

  // Past the carry limit it is a payload problem, not a typography one.
  it('rejects a name past what the request may carry', () => {
    const name = 'x'.repeat(SHEET_FIELD_LIMITS.nameInput + 1)
    expect(DeckSheetRequest.safeParse({ ...body, deck: { ...body.deck, name } }).success).toBe(false)
  })

  // setCode and types are domain codes, not prose: an allowlist keeps them one
  // byte per character, which is what lets the body cap be derived honestly.
  // The charsets come from the producers, not from today's values -
  // transform_hpjson.py's slug() hyphenates an unmapped set name, and slugify
  // in attributes.ts emits digits.
  it('accepts every code its producers can emit', () => {
    const L = SHEET_FIELD_LIMITS
    const ok = (over: Record<string, unknown>) =>
      DeckSheetRequest.safeParse({ ...body, entries: [{ ...entry, ...over }] }).success
    // slug(setName).upper() for a set missing from SET_CODES.
    for (const setCode of ['BS', 'PROMO', 'LOST-MAGIC-2', 'CHAMBER-OF-SECRETS-EXPANSION']) {
      expect(ok({ setCode }), setCode).toBe(true)
    }
    expect(ok({ setCode: 'A'.repeat(L.setCode + 1) })).toBe(false)
    expect(ok({ setCode: 'has space' })).toBe(false)
    // slugify output, digits included.
    expect(ok({ types: ['creature', 'level_2'] })).toBe(true)
    expect(ok({ types: ['Creature'] })).toBe(false)
    // Bounded so their serialized length is bounded.
    expect(ok({ imageVersion: L.imageVersion })).toBe(true)
    expect(ok({ imageVersion: L.imageVersion + 1 })).toBe(false)
    expect(ok({ orientation: 'horizontal' })).toBe(true)
    expect(ok({ orientation: null })).toBe(true)
    expect(ok({ orientation: '../x' })).toBe(false)
  })

  // The service sizes its body cap on the premise that only the two names can
  // carry a multi-byte character; every other field is allowlisted to ASCII and
  // costs one byte per unit. Loosening any of these charsets silently breaks
  // that arithmetic, so the premise is asserted rather than left in a comment.
  it('keeps every field but the names to one byte per character', () => {
    const wide = '\uD800'
    const ok = (over: Record<string, unknown>) =>
      DeckSheetRequest.safeParse({ ...body, entries: [{ ...entry, ...over }] }).success
    expect(ok({ cardId: `a${wide}` })).toBe(false)
    expect(ok({ setCode: `A${wide}` })).toBe(false)
    expect(ok({ types: [`a${wide}`] })).toBe(false)
    expect(ok({ orientation: `a${wide}` })).toBe(false)
    // The names may: that is exactly what jsonBytesPerChar pays for.
    expect(ok({ name: `a${wide}` })).toBe(true)
  })

  // Pango is fed these, but a zero-width joiner cannot grow a layout - and
  // stripping it turns one family emoji into three people.
  it('keeps the joiners that make one grapheme out of several', () => {
    const parsed = DeckSheetRequest.parse({
      ...body, deck: { ...body.deck, name: 'Team \u{1F468}\u200D\u{1F469}\u200D\u{1F467} Deck' },
    })
    expect(parsed.deck.name).toBe('Team \u{1F468}\u200D\u{1F469}\u200D\u{1F467} Deck')
  })

  // Slicing by string unit can cut a surrogate pair in half, and a lone
  // surrogate is tofu on the sheet and a second cache key for one name.
  it('never truncates into the middle of a character', () => {
    const name = `${'x'.repeat(SHEET_FIELD_LIMITS.name - 1)}\u{1F600}trailing`
    const parsed = DeckSheetRequest.parse({ ...body, deck: { ...body.deck, name } })
    // With the u flag a valid pair is one code point outside this range, so
    // this matches only an unpaired surrogate.
    expect(/[\uD800-\uDFFF]/u.test(parsed.deck.name)).toBe(false)
    expect(parsed.deck.name).toBe('x'.repeat(SHEET_FIELD_LIMITS.name - 1))
  })

  // trim ran before the slice, so the slice could put the space back.
  it('leaves no trailing space behind the truncation', () => {
    const name = `${'x'.repeat(SHEET_FIELD_LIMITS.name - 1)}   ${'y'.repeat(50)}`
    const parsed = DeckSheetRequest.parse({ ...body, deck: { ...body.deck, name } })
    expect(parsed.deck.name).toBe('x'.repeat(SHEET_FIELD_LIMITS.name - 1))
  })

  // layoutDeckSheet takes DeckSheetEntry[]; a parsed request must be usable as
  // one without a cast, or the contract and the layout have drifted apart.
  it('parses into the type the layout takes', () => {
    const parsed = DeckSheetRequest.parse(body)
    const entries: DeckSheetEntry[] = parsed.entries
    expect(computeSheetGeometry(layoutDeckSheet(parsed.deck, entries, sheetLabels('en'))).width).toBe(DECK_SHEET.width)
  })
})
