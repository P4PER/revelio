import { z } from 'zod'
import { DeckFormat, DeckZone } from './deck'
import { attrLabel } from './labels'
import { groupMainEntries, OTHER_GROUP } from './deck-groups'
import type { DeckCardView } from './domain'

// The deck sheet: the picture of a deck that the web builder exports as a PNG and
// the Discord bot posts for /deck. This module is the shared, pure half - banner,
// zones and geometry - and the request contract the render service takes. The
// bot owns no painter any more: it asks @revelio/sheet (sheet/src/render.ts), which
// is the one process that paints a deck.

export type DeckSheetEntry = Pick<
  DeckCardView,
  'cardId' | 'zone' | 'quantity' | 'name' | 'setCode' | 'types' | 'imageVersion' | 'orientation' | 'artCropVersion'
>

// The locales the sheet renders. The request contract validates against this,
// so an unknown locale is a 400 rather than a picture full of English.
export const SHEET_LOCALES = ['en', 'de'] as const

// Upper bound on entries in one sheet. Geometry grows with the entry count, so
// an uncapped payload is a memory-exhaustion input; 400 is far past any legal
// deck (a 60-card main plus a sideboard is well under 100 distinct entries).
export const MAX_SHEET_ENTRIES = 400

/**
 * A string the sheet paints. Two separate jobs, which used to be one and were
 * wrong for it.
 *
 * Collapsing: every run of whitespace or control characters becomes one space,
 * because the painter feeds these to Pango, which honours newlines - enough of
 * them grow the title layer past the canvas and sharp rejects the composite, so
 * one pasted name would 500 that deck's sheet forever.
 *
 * Truncating: nothing upstream bounds these. duplicateDeckAction appends
 * " (copy)" by calling createDeck directly, past the writer schema that caps a
 * name at 120, and a localized card name is saved with no max at all. A length
 * the sheet cannot paint is a cosmetic fact - fitText already ellipsizes to the
 * card box - so rejecting one would turn it into "this deck has no picture,
 * ever". `paint` is what the picture gets; `carry` is the hard bound on what the
 * request may hold, and past that it is a payload problem and a 400.
 */
const paintedText = (paint: number, carry: number) =>
  z.string().max(carry)
    .transform((v) => v
      // Whitespace and C0/C1 controls only. Not \p{Cf} wholesale: that class
      // holds the zero-width joiner, and stripping it turns one family emoji
      // into three separate people. Neither it nor a soft hyphen can grow a
      // Pango layout, which is the whole reason this collapse exists. The bidi
      // overrides are the part of \p{Cf} worth removing, so they are named.
      .replace(/[\s\p{Cc}\u202A-\u202E\u2066-\u2069]+/gu, ' ')
      .trim()
      .slice(0, paint)
      // Slicing by string unit can cut a surrogate pair in half; a lone high
      // surrogate renders as tofu and would key a cache separately from the
      // same name sliced elsewhere.
      .replace(/[\uD800-\uDBFF]$/u, '')
      // Trimmed again because the slice can land mid-gap and leave the space
      // the collapse just normalised.
      .trim())
    .pipe(z.string().min(1))

export const SHEET_FIELD_LIMITS = {
  cardId: 80,
  // What the sheet paints, and what it will carry to get there. Real names top
  // out at 51 across the dataset; the carry headroom is for the growth upstream
  // allows rather than for anything the picture needs.
  name: 120,
  nameInput: 200,
  // Hyphens included and the ceiling generous because card-data derives this
  // for any set name not in SET_CODES: transform_hpjson.py's slug() replaces
  // every non-alphanumeric run with a hyphen, so 'Chamber of Secrets Expansion'
  // gives CHAMBER-OF-SECRETS-EXPANSION. (sets.code in build_dataset.py strips
  // instead - a different field, and they disagree.)
  setCode: 40,
  types: 8,
  typeLength: 30,
  // Bounded so the serialized digits are bounded: an unbounded integer is 21
  // characters of JSON at its longest. Ten digits, because this is an image
  // file's mtime in unix seconds (ingest's fileVersion), which passed 1e9 in
  // 2001 and reaches 1e10 in 2286 - a cap of 1e6 rejected every card in the
  // dataset, and with it every sheet.
  imageVersion: 9_999_999_999,
  orientation: 20,
  // Worst-case bytes on the wire per JS string unit of free text, which is what
  // the render service sizes its body cap from. Six, not three: UTF-8 costs at
  // most three for a BMP character (and four across the two units of a
  // surrogate pair, so less per unit), but JSON escapes an unpaired surrogate
  // to a six-byte \uXXXX sequence. That is the worst case rather than a control
  // character, because \p{Cs} is not in the collapse class above, trim does not
  // touch it and it survives min(1) - so a name of them is valid. Every other
  // field is allowlisted to ASCII, so only the names pay this.
  jsonBytesPerChar: 6,
} as const

export const DeckSheetEntryInput = z.object({
  // An allowlist, not a length limit: this is interpolated into the art URL's
  // path, so '../' in an id would otherwise send the render service at an
  // arbitrary path on the image host. Every id in the dataset is [a-z0-9-].
  cardId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).max(SHEET_FIELD_LIMITS.cardId),
  zone: DeckZone,
  quantity: z.number().int().min(1).max(999),
  name: paintedText(SHEET_FIELD_LIMITS.name, SHEET_FIELD_LIMITS.nameInput),
  // Domain codes rather than prose, so they are allowlisted like cardId: it
  // keeps them one byte per character, which is what lets the service derive a
  // body cap it can honour.
  setCode: z.string().regex(/^[A-Za-z0-9-]+$/).max(SHEET_FIELD_LIMITS.setCode),
  // slugify in attributes.ts emits [a-z0-9_], digits included, so a type code
  // like level_2 must pass.
  types: z.array(z.string().regex(/^[a-z0-9_]+$/).max(SHEET_FIELD_LIMITS.typeLength)).max(SHEET_FIELD_LIMITS.types),
  imageVersion: z.number().int().nonnegative().max(SHEET_FIELD_LIMITS.imageVersion).nullable(),
  // The banner's art crop (images.ts artCropKey). Read on the character entry
  // only; pickSheetEntries sends null everywhere else. Defaulted so a caller
  // that predates the banner still sends a valid body, and bounded like
  // imageVersion because it is the same unix-seconds mtime.
  artCropVersion: z.number().int().nonnegative().max(SHEET_FIELD_LIMITS.imageVersion).nullable().default(null),
  // Allowlisted like the codes above rather than left as free text: only
  // 'horizontal' is ever read, and an unbounded string here is bytes the body
  // cap has to carry for nothing.
  orientation: z.string().regex(/^[a-z]+$/).max(SHEET_FIELD_LIMITS.orientation).nullable(),
})

// What the render service takes. The body is the sheet's whole input, which is
// what lets the service key its cache on a hash of it.
export const DeckSheetRequest = z.object({
  locale: z.enum(SHEET_LOCALES),
  // The caller's own ceiling on the encoded image, in bytes. /deck sends
  // Discord's attachment limit; a browser download sends none. The service
  // derives a pixel budget from it rather than owning a second cap.
  maxBytes: z.number().int().min(100_000).max(50_000_000).optional(),
  deck: z.object({
    name: paintedText(SHEET_FIELD_LIMITS.name, SHEET_FIELD_LIMITS.nameInput),
    format: DeckFormat,
  }),
  entries: z.array(DeckSheetEntryInput).min(1).max(MAX_SHEET_ENTRIES),
})

export type DeckSheetRequest = z.infer<typeof DeckSheetRequest>

export type DeckSheetCard = {
  cardId: string
  quantity: number
  name: string
  setCode: string
  imageVersion: number | null
  orientation: string | null
}

// One segment of the banner's makeup bar and its legend entry.
export type DeckSheetMakeup = { key: string; label: string; count: number; color: string }

// The hero banner. `character` is null for a deck without one; its
// artCropVersion is null when the card has no crop, which the painter answers
// with the glow fallback rather than a different layout.
export type DeckSheetBanner = {
  name: string
  eyebrow: string
  character: { card: DeckSheetCard; label: string; artCropVersion: number | null } | null
  makeup: DeckSheetMakeup[]
}

// `title` is null for the sideboard's single group: the zone header names it.
export type DeckSheetGroup = { key: string; title: string | null; count: number; color: string; cards: DeckSheetCard[] }
export type DeckSheetZone = { title: string; count: number; groups: DeckSheetGroup[] }
export type DeckSheetLayout = { banner: DeckSheetBanner; zones: DeckSheetZone[] }

// Localized labels for the sheet, resolved by sheetLabels from core's own
// catalog. `group` maps a deck-groups type key (creature, spell, ..., or
// OTHER_GROUP) to its localized plural label.
export type DeckSheetLabels = {
  formatLabel: Record<DeckFormat, string>
  mainDeck: string
  sideboard: string
  cards: string
  startingCharacter: string
  group: (key: string) => string
}

export type Rect = { x: number; y: number; w: number; h: number }
// `x`/`y` are the top-left of the drawn card box; `w`/`h` its size - portrait
// cards are cardWidth x cardHeight, horizontal cards the same card turned
// upright. Cards sit on the bottom edge of their row.
export type PositionedCard = { card: DeckSheetCard; x: number; y: number; w: number; h: number }
// `x` is the group's left edge and `labelY` the top of its label band (or of its
// cards, for an untitled group).
export type PositionedGroup = { key: string; title: string | null; count: number; color: string; x: number; labelY: number; cards: PositionedCard[] }
export type PositionedZone = { title: string; count: number; headerY: number; groups: PositionedGroup[] }
export type PositionedBanner = { art: Rect; card: PositionedCard | null; textX: number; textWidth: number; bar: Rect; legendY: number }
export type SheetGeometry = { width: number; height: number; banner: PositionedBanner; zones: PositionedZone[]; logo: Rect }

export const DECK_SHEET_COLORS = {
  background: '#13122A',
  panel: '#1C1838',
  border: '#2E2A50',
  gold: '#E8B23A',
  goldLight: '#F6D58B',
  mutedAccent: '#8C88A8',
  parchment: '#FBF3DC',
  // Makeup bar and legend swatch per deck-groups key. Fixed so a type is the
  // same colour on every sheet; Lessons, the resource base, are the one gold.
  group: {
    creature: '#6E66C9',
    spell: '#8C88A8',
    item: '#4B4486',
    adventure: '#B9B3D9',
    location: '#5A5390',
    event: '#9A93D6',
    match: '#3B3194',
    character: '#7D78A6',
    [OTHER_GROUP]: '#57537A',
    lesson: '#E8B23A',
  } as Record<string, string>,
} as const

// Layout pixels; the painter multiplies by DECK_SHEET.scale (or less, inside
// the pixel budget). Values are spec section 3 and 4 and mock B.
export const DECK_SHEET = {
  // Device pixels per layout pixel. The render service lowers it for a sheet
  // that would pass its pixel budget (sheetScale in sheet/src/render.ts).
  scale: 2,
  width: 1440,
  padding: 40,
  bannerHeight: 320,
  // The art area is right-aligned and full height. focusY is how much of the
  // crop's spare height is cut from the top: faces sit high in the crops.
  art: { width: 880, focusY: 0.3 },
  heroCard: { x: 40, y: 40, w: 224, h: 160 },
  text: { xWithCard: 290, widthWithCard: 560, widthAlone: 1000, eyebrowY: 58, titleY: 84, subtitleY: 146 },
  bar: { y: 254, height: 10, gap: 2, legendY: 274 },
  zoneGap: 24,
  zoneHeaderHeight: 44,
  groupLabelHeight: 22,
  // Also the room above a row for the stacked-copy outlines (two x stackOffset).
  groupLabelGap: 10,
  groupGapX: 36,
  groupGapY: 24,
  // Portrait card box, 5:7.
  cardWidth: 112,
  cardHeight: 157,
  cardRadius: 6,
  cardGapX: 16,
  // Leaves room for the chip that overhangs each card's bottom edge.
  cardGapY: 20,
  stackOffset: 5,
  chip: { height: 26, minWidth: 30, padX: 7, overhangX: 6, overhangY: 8 },
  footerHeight: 72,
  // logos/revelio-logo-dark.svg is 262 x 78.
  logo: { height: 34, aspect: 262 / 78 },
  fontSize: { eyebrow: 12, title: 44, subtitle: 15, legend: 12, zone: 13, group: 12, chipSign: 11, chip: 14, placeholder: 12 },
  tracking: { eyebrow: 0.2, zone: 0.2, group: 0.14 },
} as const

const CONTENT_W = DECK_SHEET.width - DECK_SHEET.padding * 2
const CONTENT_RIGHT = DECK_SHEET.padding + CONTENT_W

function groupColor(key: string): string {
  return DECK_SHEET_COLORS.group[key] ?? DECK_SHEET_COLORS.group[OTHER_GROUP]
}

function cardCell(v: DeckSheetEntry): DeckSheetCard {
  return {
    cardId: v.cardId,
    quantity: v.quantity,
    name: v.name,
    setCode: v.setCode,
    imageVersion: v.imageVersion ?? null,
    orientation: v.orientation ?? null,
  }
}

// Drawn box size for a card: horizontal cards render as an upright landscape card.
function cardBox(card: DeckSheetCard): { w: number; h: number } {
  return card.orientation === 'horizontal'
    ? { w: DECK_SHEET.cardHeight, h: DECK_SHEET.cardWidth }
    : { w: DECK_SHEET.cardWidth, h: DECK_SHEET.cardHeight }
}

function naturalWidth(cards: DeckSheetCard[]): number {
  return cards.reduce((w, c) => w + cardBox(c).w, 0) + DECK_SHEET.cardGapX * Math.max(0, cards.length - 1)
}

const sum = (list: { quantity: number }[]) => list.reduce((n, e) => n + e.quantity, 0)

// One group's cards from (left, top), wrapping at the content's right edge. A
// row is as tall as its tallest card and cards sit on its bottom edge, so a
// row of landscape cards does not keep a portrait row's empty band.
function placeCards(cards: DeckSheetCard[], left: number, top: number): { cards: PositionedCard[]; width: number; height: number } {
  if (!cards.length) return { cards: [], width: 0, height: 0 }
  const rows: { card: DeckSheetCard; x: number; w: number; h: number }[][] = [[]]
  let x = left
  let width = 0
  for (const card of cards) {
    const { w, h } = cardBox(card)
    if (x > left && x + w > CONTENT_RIGHT) { rows.push([]); x = left }
    rows[rows.length - 1].push({ card, x, w, h })
    width = Math.max(width, x + w - left)
    x += w + DECK_SHEET.cardGapX
  }
  const placed: PositionedCard[] = []
  let y = top
  for (const row of rows) {
    const rowH = Math.max(...row.map((c) => c.h))
    for (const c of row) placed.push({ card: c.card, x: c.x, y: y + rowH - c.h, w: c.w, h: c.h })
    y += rowH + DECK_SHEET.cardGapY
  }
  return { cards: placed, width, height: y - DECK_SHEET.cardGapY - top }
}

function bannerGeometry(layout: DeckSheetLayout): PositionedBanner {
  const { width, padding, bannerHeight, art, heroCard, text, bar } = DECK_SHEET
  const character = layout.banner.character
  return {
    art: { x: width - art.width, y: 0, w: art.width, h: bannerHeight },
    card: character ? { card: character.card, ...heroCard } : null,
    textX: character ? text.xWithCard : padding,
    textWidth: character ? text.widthWithCard : text.widthAlone,
    bar: { x: padding, y: bar.y, w: CONTENT_W, h: bar.height },
    legendY: bar.legendY,
  }
}

/**
 * The sheet's labels for one locale, resolved from core's own catalog. The
 * render service calls this instead of taking labels in its request: the sheet
 * is cached on its input, and translations in that input would mean a label
 * change in one caller's catalog silently renders a different picture.
 *
 * Record<DeckFormat, string> is what makes a new format a type error here
 * rather than a missing title at render time.
 */
export function sheetLabels(locale: string): DeckSheetLabels {
  return {
    formatLabel: {
      classic: attrLabel('formats', 'classic', locale),
      revival: attrLabel('formats', 'revival', locale),
    },
    mainDeck: attrLabel('deckSheet', 'mainDeck', locale),
    sideboard: attrLabel('deckSheet', 'sideboard', locale),
    cards: attrLabel('deckSheet', 'cards', locale),
    startingCharacter: attrLabel('deckSheet', 'startingCharacter', locale),
    group: (key) => attrLabel('deckGroups', key === OTHER_GROUP ? 'other' : key, locale),
  }
}

/**
 * Narrows card views to the fields the sheet paints. Both callers hold
 * DeckCardView lists with a dozen fields the picture never uses; sending them
 * would widen the request, and with it the cache key, for nothing.
 *
 * Returns the request's own entry type rather than DeckSheetEntry: that one
 * inherits `orientation?` from DeckCardView, and the `?? null` below is exactly
 * what settles it - a caller assigning the result straight into a
 * DeckSheetRequest would otherwise not typecheck against a field this function
 * has already made non-optional.
 */
export function pickSheetEntries(views: DeckSheetEntry[]): DeckSheetRequest['entries'] {
  return views.map((v) => ({
    cardId: v.cardId, zone: v.zone, quantity: v.quantity, name: v.name,
    setCode: v.setCode, types: v.types, imageVersion: v.imageVersion ?? null,
    orientation: v.orientation ?? null,
    artCropVersion: v.zone === 'character' ? v.artCropVersion ?? null : null,
  }))
}

/**
 * Splits a deck into the banner and its zones. The character appears only in
 * the banner: it is not one of the main deck's cards, so neither the zone
 * counts nor the makeup bar include it. Main-zone groups reuse the deck view's
 * type grouping (groupMainEntries), so the sheet matches the builder, with
 * Lessons last. Cards keep the order they arrive in within a group.
 */
export function layoutDeckSheet(
  deck: { name: string; format: DeckFormat },
  entries: DeckSheetEntry[],
  labels: DeckSheetLabels,
): DeckSheetLayout {
  const characterEntry = entries.find((e) => e.zone === 'character')
  const main = entries.filter((e) => e.zone === 'main')
  const sideboard = entries.filter((e) => e.zone === 'sideboard')
  const mainCount = sum(main)

  const groups: DeckSheetGroup[] = [...groupMainEntries(main)].map(([key, list]) => ({
    key, title: labels.group(key).toUpperCase(), count: sum(list), color: groupColor(key), cards: list.map(cardCell),
  }))

  const zones: DeckSheetZone[] = []
  if (main.length) zones.push({ title: labels.mainDeck.toUpperCase(), count: mainCount, groups })
  if (sideboard.length) {
    zones.push({
      title: labels.sideboard.toUpperCase(),
      count: sum(sideboard),
      groups: [{ key: 'sideboard', title: null, count: sum(sideboard), color: groupColor(OTHER_GROUP), cards: sideboard.map(cardCell) }],
    })
  }

  return {
    banner: {
      name: deck.name,
      // A separator instead of "Classic deck", so no locale has to inflect the
      // format name.
      eyebrow: `${labels.formatLabel[deck.format]} · ${mainCount} ${labels.cards}`.toUpperCase(),
      character: characterEntry
        ? { card: cardCell(characterEntry), label: labels.startingCharacter, artCropVersion: characterEntry.artCropVersion ?? null }
        : null,
      makeup: groups.map((g) => ({ key: g.key, label: labels.group(g.key), count: g.count, color: g.color })),
    },
    zones,
  }
}

/**
 * Positions everything on the sheet. Below the banner, each zone is a header
 * followed by its groups packed left to right as inline blocks: a group that
 * does not fit what is left of the line starts a new one, a group wider than
 * the content takes a line of its own and wraps inside it, and a line is as
 * tall as its tallest group. Greedy and order-keeping on purpose - the group
 * order is information (Lessons last), which outranks a few pixels of gap.
 */
export function computeSheetGeometry(layout: DeckSheetLayout): SheetGeometry {
  const D = DECK_SHEET
  const zones: PositionedZone[] = []
  let y = D.bannerHeight + D.zoneGap
  for (const zone of layout.zones) {
    const headerY = y
    let lineTop = y + D.zoneHeaderHeight
    let lineH = 0
    let x = D.padding
    const groups: PositionedGroup[] = []
    for (const g of zone.groups) {
      if (x > D.padding && x + naturalWidth(g.cards) > CONTENT_RIGHT) {
        x = D.padding
        lineTop += lineH + D.groupGapY
        lineH = 0
      }
      const cardsTop = lineTop + (g.title === null ? 0 : D.groupLabelHeight) + D.groupLabelGap
      const placed = placeCards(g.cards, x, cardsTop)
      groups.push({ key: g.key, title: g.title, count: g.count, color: g.color, x, labelY: lineTop, cards: placed.cards })
      lineH = Math.max(lineH, cardsTop + placed.height - lineTop)
      x += placed.width + D.groupGapX
    }
    zones.push({ title: zone.title, count: zone.count, headerY, groups })
    y = lineTop + lineH + D.zoneGap
  }
  const height = (zones.length ? y - D.zoneGap : D.bannerHeight) + D.footerHeight
  const logoW = Math.round(D.logo.height * D.logo.aspect)
  return {
    width: D.width,
    height,
    banner: bannerGeometry(layout),
    zones,
    logo: { x: D.width - D.padding - logoW, y: height - D.footerHeight / 2 - D.logo.height / 2, w: logoW, h: D.logo.height },
  }
}

/**
 * The makeup bar's segments: one per group, sized by count, 2px apart. Widths
 * are rounded and the last segment takes the remainder, so the bar always ends
 * flush with the content edge whatever the rounding did.
 */
export function makeupSegments(makeup: DeckSheetMakeup[], bar: Rect): (Rect & { color: string })[] {
  const total = makeup.reduce((n, m) => n + m.count, 0)
  if (!total) return []
  const free = bar.w - DECK_SHEET.bar.gap * (makeup.length - 1)
  let x = bar.x
  let used = 0
  return makeup.map((m, i) => {
    const w = i === makeup.length - 1 ? free - used : Math.round((m.count / total) * free)
    const segment = { x, y: bar.y, w, h: bar.h, color: m.color }
    x += w + DECK_SHEET.bar.gap
    used += w
    return segment
  })
}
