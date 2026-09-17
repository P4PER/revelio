import type { DeckFormat } from './deck'
import { groupMainEntries } from './deck-groups'
import type { DeckCardView } from './domain'

// The deck sheet: the picture of a deck that the web builder exports as a PNG and
// the Discord bot posts for /deck. This module is the shared, pure half - grouping,
// geometry and colours. Each side paints it with what its runtime has: the browser
// with a Canvas (web/src/lib/deck-png.ts), the bot with sharp
// (bot/src/images/deck-image.ts). Geometry is in CSS pixels; painters multiply by
// DECK_SHEET.scale.

export type DeckSheetEntry = Pick<
  DeckCardView,
  'cardId' | 'zone' | 'quantity' | 'name' | 'setCode' | 'types' | 'imageVersion' | 'orientation'
>

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
