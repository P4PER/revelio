import type { DeckCardView, DeckFormat } from '@revelio/core'

// Pure layout model for the PNG deck sheet: grouping + text formatting only,
// no canvas. Mirrors the main-zone grouping in deck-panel.tsx (lesson code,
// or a synthetic "Lessons"/"Items" bucket) so the exported sheet matches what
// the builder shows. Kept English-only, like @revelio/core's toText — the
// image is a shareable artifact, not a localized UI surface.
export type DeckPngSection = {
  title: string
  color: string
  lines: string[]
}
export type DeckPngLayout = {
  title: string
  sections: DeckPngSection[]
}

const GOLD = '#E8B23A'
const MUTED_ACCENT = '#8C88A8'

const FORMAT_LABEL: Record<DeckFormat, string> = { classic: 'Classic', revival: 'Revival' }

const LESSON_HEX: Record<string, string> = {
  charms: '#0069A9',
  potions: '#00A661',
  transfiguration: '#BC3E4D',
  care_of_magical_creatures: '#836444',
  quidditch: '#E2AE37',
}
const LESSON_LABEL: Record<string, string> = {
  charms: 'Charms',
  potions: 'Potions',
  transfiguration: 'Transfiguration',
  care_of_magical_creatures: 'Care of Magical Creatures',
  quidditch: 'Quidditch',
}

const LESSON_GROUP = '__lesson__'
const ITEM_GROUP = '__item__'

function groupKey(e: DeckCardView): string {
  if (e.isLesson) return LESSON_GROUP
  if (e.lesson) return e.lesson
  return ITEM_GROUP
}
function groupColor(key: string): string {
  if (key === LESSON_GROUP) return GOLD
  if (key === ITEM_GROUP) return MUTED_ACCENT
  return LESSON_HEX[key] ?? MUTED_ACCENT
}
function groupLabel(key: string): string {
  if (key === LESSON_GROUP) return 'Lessons'
  if (key === ITEM_GROUP) return 'Items'
  return LESSON_LABEL[key] ?? key
}

function cardLine(v: DeckCardView): string {
  return `${v.quantity}x ${v.name} (${v.setCode})`
}

export function layoutDeckLines(
  deck: { name: string; format: DeckFormat },
  entries: DeckCardView[],
): DeckPngLayout {
  const title = `${deck.name} (${FORMAT_LABEL[deck.format]})`
  const sections: DeckPngSection[] = []

  const character = entries.find((e) => e.zone === 'character')
  if (character) sections.push({ title: 'Character', color: GOLD, lines: [cardLine(character)] })

  const main = entries.filter((e) => e.zone === 'main')
  if (main.length) {
    const mainCount = main.reduce((n, e) => n + e.quantity, 0)
    sections.push({ title: `Main deck (${mainCount})`, color: GOLD, lines: [] })
    const groups = new Map<string, DeckCardView[]>()
    for (const e of main) groups.set(groupKey(e), [...(groups.get(groupKey(e)) ?? []), e])
    for (const [key, list] of groups) {
      const count = list.reduce((n, e) => n + e.quantity, 0)
      sections.push({ title: `${groupLabel(key)} (${count})`, color: groupColor(key), lines: list.map(cardLine) })
    }
  }

  const sideboard = entries.filter((e) => e.zone === 'sideboard')
  if (sideboard.length) {
    const sideCount = sideboard.reduce((n, e) => n + e.quantity, 0)
    sections.push({ title: `Sideboard (${sideCount})`, color: GOLD, lines: sideboard.map(cardLine) })
  }

  return { title, sections }
}

// --- Canvas rendering (browser-only) ---

const BG = '#13122A'
const CARD_BG = '#1C1838'
const BORDER = '#2E2A50'
const PARCHMENT = '#FBF3DC'

const SCALE = 2
const WIDTH = 980
const PADDING = 36
const COLUMN_GAP = 32
const TITLE_FONT = '600 28px system-ui, sans-serif'
const SECTION_FONT = '600 16px system-ui, sans-serif'
const LINE_FONT = '400 14px system-ui, sans-serif'
const TITLE_HEIGHT = 48
const SECTION_TITLE_HEIGHT = 26
const LINE_HEIGHT = 21
const SECTION_GAP = 12
const SWATCH_SIZE = 12

function sectionHeight(section: DeckPngSection): number {
  return SECTION_TITLE_HEIGHT + section.lines.length * LINE_HEIGHT + SECTION_GAP
}

// Splits sections across 1 or 2 columns. Sections stay intact (never split
// mid-list) — a simple greedy "shortest column first" bin-pack keeps the two
// columns roughly balanced without needing to break up a lesson group.
function columnize(sections: DeckPngSection[]): DeckPngSection[][] {
  const totalLines = sections.reduce((n, s) => n + s.lines.length, 0)
  if (totalLines <= 24 || sections.length < 2) return [sections]

  const columns: DeckPngSection[][] = [[], []]
  const heights = [0, 0]
  for (const section of sections) {
    const col = heights[0] <= heights[1] ? 0 : 1
    columns[col].push(section)
    heights[col] += sectionHeight(section)
  }
  return columns
}

function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const candidate = `${text.slice(0, mid)}…`
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return `${text.slice(0, lo)}…`
}

// Renders a shareable deck-sheet PNG entirely client-side (Canvas API — the
// app's CSP forbids pulling in an external image/PDF library). Canvas height
// is computed from the content so nothing clips; long decks wrap into two
// columns via columnize().
export async function renderDeckPng(
  deck: { name: string; format: DeckFormat },
  entries: DeckCardView[],
): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('renderDeckPng can only run in a browser')

  const { title, sections } = layoutDeckLines(deck, entries)
  const columns = columnize(sections)
  const columnWidth = columns.length === 2 ? (WIDTH - PADDING * 2 - COLUMN_GAP) / 2 : WIDTH - PADDING * 2
  const columnHeights = columns.map((col) => col.reduce((n, s) => n + sectionHeight(s), 0))
  const contentHeight = Math.max(...columnHeights, LINE_HEIGHT)
  const height = TITLE_HEIGHT + contentHeight + PADDING * 2

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH * SCALE
  canvas.height = height * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is unavailable')
  ctx.scale(SCALE, SCALE)

  // Background sheet: midnight frame around a card-colored panel
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, WIDTH, height)
  const FRAME = 8
  ctx.fillStyle = CARD_BG
  ctx.fillRect(FRAME, FRAME, WIDTH - FRAME * 2, height - FRAME * 2)
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  ctx.strokeRect(FRAME + 0.5, FRAME + 0.5, WIDTH - FRAME * 2 - 1, height - FRAME * 2 - 1)

  // Title
  ctx.fillStyle = GOLD
  ctx.font = TITLE_FONT
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(truncateToWidth(ctx, title, WIDTH - PADDING * 2), PADDING, PADDING + 22)

  columns.forEach((col, colIndex) => {
    const x = PADDING + colIndex * (columnWidth + COLUMN_GAP)
    let y = PADDING + TITLE_HEIGHT
    for (const section of col) {
      ctx.fillStyle = section.color
      ctx.fillRect(x, y - SWATCH_SIZE + 4, SWATCH_SIZE / 3, SWATCH_SIZE)
      ctx.fillStyle = PARCHMENT
      ctx.font = SECTION_FONT
      ctx.fillText(truncateToWidth(ctx, section.title, columnWidth - 14), x + 12, y)
      y += SECTION_TITLE_HEIGHT

      ctx.font = LINE_FONT
      for (const lineText of section.lines) {
        ctx.fillText(truncateToWidth(ctx, lineText, columnWidth - 14), x + 12, y)
        y += LINE_HEIGHT
      }
      y += SECTION_GAP
    }
  })

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to render deck PNG'))
    }, 'image/png')
  })
}
