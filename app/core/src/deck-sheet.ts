import { z } from 'zod'
import { DeckFormat, DeckZone } from './deck'
import { attrLabel } from './labels'
import { groupMainEntries, OTHER_GROUP } from './deck-groups'
import type { DeckCardView } from './domain'

// The deck sheet: the picture of a deck that the web builder exports as a PNG and
// the Discord bot posts for /deck. This module is the shared, pure half - grouping,
// geometry and colours - and the request contract the render service takes. The
// bot owns no painter any more: it asks @revelio/sheet (sheet/src/render.ts), which
// is the one process that paints a deck. Geometry is in CSS pixels; the painter
// multiplies by DECK_SHEET.scale.

export type DeckSheetEntry = Pick<
  DeckCardView,
  'cardId' | 'zone' | 'quantity' | 'name' | 'setCode' | 'types' | 'imageVersion' | 'orientation'
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
  // characters of JSON at its longest, against six for anything real.
  imageVersion: 1_000_000,
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

export type DeckSheetSection = {
  title: string
  color: string
  cards: DeckSheetCard[]
}

export type DeckSheetLayout = {
  title: string
  sections: DeckSheetSection[]
}

// Localized labels for the sheet, resolved by the caller from its own catalog
// (next-intl on the web, the bot's i18n in Discord), so this module needs
// neither. `group` maps a deck-groups type key (creature, spell, ..., or
// OTHER_GROUP) to its localized plural label.
export type DeckSheetLabels = {
  formatLabel: Record<DeckFormat, string>
  character: string
  mainDeck: string
  sideboard: string
  group: (key: string) => string
}

// `x`/`y` are the top-left of the drawn card box; `w`/`h` are its size - portrait
// cards are cardWidth x cardHeight, horizontal cards the same card turned upright,
// cardHeight x cardWidth. Cards sit in rows of uniform cardHeight; horizontal cards
// are centered vertically within that row.
export type PositionedCard = { card: DeckSheetCard; x: number; y: number; w: number; h: number }
export type PositionedSection = { title: string; color: string; headerY: number; cards: PositionedCard[] }
export type SheetGeometry = { width: number; height: number; sections: PositionedSection[] }

export const DECK_SHEET_COLORS = {
  background: '#13122A',
  panel: '#1C1838',
  border: '#2E2A50',
  gold: '#E8B23A',
  mutedAccent: '#8C88A8',
  parchment: '#FBF3DC',
  badgeText: '#1A1730',
} as const

export const DECK_SHEET = {
  // Device pixels per layout pixel. The browser clamps it further for very tall
  // decks (see deck-png.ts); the bot renders at this scale as is.
  scale: 2,
  width: 980,
  padding: 36,
  // Midnight margin around the card-coloured panel.
  frame: 8,
  titleHeight: 48,
  // Baseline of the title, measured from the top padding.
  titleBaseline: 22,
  sectionHeaderHeight: 30,
  swatchSize: 12,
  // Portrait card box, 5:7.
  cardWidth: 132,
  cardHeight: 185,
  // Horizontal gap between cards.
  gridGap: 12,
  // Vertical gap between rows - leaves room for the badge that hangs below each card.
  rowGap: 26,
  sectionGap: 16,
  badgeRadius: 14,
  fontSize: { title: 28, section: 16, placeholder: 14, badge: 15 },
} as const

const CONTENT_W = DECK_SHEET.width - DECK_SHEET.padding * 2

// Swatch color: gold for the Lessons resource base, neutral otherwise - matching
// the deck view's group marker (var(--primary) vs var(--muted-foreground)).
function groupColor(key: string): string {
  return key === 'lesson' ? DECK_SHEET_COLORS.gold : DECK_SHEET_COLORS.mutedAccent
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
  }))
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
    character: attrLabel('deckSheet', 'character', locale),
    mainDeck: attrLabel('deckSheet', 'mainDeck', locale),
    sideboard: attrLabel('deckSheet', 'sideboard', locale),
    group: (key) => attrLabel('deckGroups', key === OTHER_GROUP ? 'other' : key, locale),
  }
}

// Groups a deck into sheet sections. Reuses the deck view's type-based main-zone
// grouping (groupMainEntries) so the sheet matches the builder - Creatures /
// Spells / Items / ... with Lessons pinned last. Cards keep the order they arrive
// in within a section, so the caller decides that order.
export function layoutDeckSheet(
  deck: { name: string; format: DeckFormat },
  entries: DeckSheetEntry[],
  labels: DeckSheetLabels,
): DeckSheetLayout {
  const title = `${deck.name} (${labels.formatLabel[deck.format]})`
  const sections: DeckSheetSection[] = []

  const character = entries.find((e) => e.zone === 'character')
  if (character) sections.push({ title: labels.character, color: DECK_SHEET_COLORS.gold, cards: [cardCell(character)] })

  const main = entries.filter((e) => e.zone === 'main')
  if (main.length) {
    const mainCount = main.reduce((n, e) => n + e.quantity, 0)
    sections.push({ title: `${labels.mainDeck} (${mainCount})`, color: DECK_SHEET_COLORS.gold, cards: [] })
    for (const [key, list] of groupMainEntries(main)) {
      const count = list.reduce((n, e) => n + e.quantity, 0)
      sections.push({ title: `${labels.group(key)} (${count})`, color: groupColor(key), cards: list.map(cardCell) })
    }
  }

  const sideboard = entries.filter((e) => e.zone === 'sideboard')
  if (sideboard.length) {
    const sideCount = sideboard.reduce((n, e) => n + e.quantity, 0)
    sections.push({ title: `${labels.sideboard} (${sideCount})`, color: DECK_SHEET_COLORS.gold, cards: sideboard.map(cardCell) })
  }

  return { title, sections }
}

// Positions each card into a flowing, wrapping grid and computes the total sheet
// height. Content starts below the title; each section contributes a header plus
// its wrapped rows of cards; a card-less section (e.g. the "Main deck (N)"
// heading) contributes only its header. Cards flow left-to-right by their actual
// width (portrait and landscape cards pack tightly with a uniform gap), wrapping
// when the next card would overflow the content width.
export function computeSheetGeometry(layout: DeckSheetLayout): SheetGeometry {
  const { padding, titleHeight, sectionHeaderHeight, cardHeight, gridGap, rowGap, sectionGap } = DECK_SHEET
  const sections: PositionedSection[] = []
  let y = padding + titleHeight
  for (const s of layout.sections) {
    const headerY = y
    const gridTop = y + sectionHeaderHeight
    let x = padding
    let rows = s.cards.length ? 1 : 0
    const cards: PositionedCard[] = s.cards.map((card) => {
      const { w, h } = cardBox(card)
      if (x > padding && x + w > padding + CONTENT_W) { x = padding; rows += 1 }
      const rowTop = gridTop + (rows - 1) * (cardHeight + rowGap)
      const pc: PositionedCard = { card, x, y: rowTop + Math.round((cardHeight - h) / 2), w, h }
      x += w + gridGap
      return pc
    })
    const gridH = rows > 0 ? rows * cardHeight + (rows - 1) * rowGap : 0
    sections.push({ title: s.title, color: s.color, headerY, cards })
    y = gridTop + gridH + sectionGap
  }
  const height = y - sectionGap + padding
  return { width: DECK_SHEET.width, height, sections }
}
