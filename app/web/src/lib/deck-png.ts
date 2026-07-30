import type { DeckCardView, DeckFormat } from '@revelio/core'
import { imageUrl, imageKey } from '@revelio/core'
import { groupMainEntries } from './deck-groups'

// Pure layout model for the PNG deck sheet: grouping + geometry only, no canvas.
// Reuses the deck view's type-based main-zone grouping (groupMainEntries) so the
// exported sheet matches the builder — Creatures / Spells / Items / … with
// Lessons pinned last. Section labels are supplied by the caller (DeckSheetLabels,
// resolved from next-intl in deck-export-menu.tsx) so the sheet is localized while
// this module stays free of any next-intl dependency.
export type DeckPngCard = {
  cardId: string
  quantity: number
  name: string
  setCode: string
  imageVersion: number | null
  orientation: string | null
}
export type DeckPngSection = {
  title: string
  color: string
  cards: DeckPngCard[]
}
export type DeckPngLayout = {
  title: string
  sections: DeckPngSection[]
}

const GOLD = '#E8B23A'
const MUTED_ACCENT = '#8C88A8'

// Localized labels for the sheet, resolved by the caller from next-intl (the
// export runs client-side where a translation function is available). Keeping
// these out of the pure layout means deck-png.ts has no next-intl dependency and
// stays trivially testable. `group` maps a deck-groups type key (creature,
// spell, …, or OTHER_GROUP) to its localized plural label.
export type DeckSheetLabels = {
  formatLabel: Record<DeckFormat, string>
  character: string
  mainDeck: string
  sideboard: string
  group: (key: string) => string
}

// Canvas swatch color: gold for the Lessons resource base, neutral otherwise —
// matching deck-groups' groupColor (var(--primary) vs var(--muted-foreground)).
function groupColor(key: string): string {
  return key === 'lesson' ? GOLD : MUTED_ACCENT
}

function cardCell(v: DeckCardView): DeckPngCard {
  return {
    cardId: v.cardId,
    quantity: v.quantity,
    name: v.name,
    setCode: v.setCode,
    imageVersion: v.imageVersion ?? null,
    orientation: v.orientation ?? null,
  }
}

export function layoutDeckSheet(
  deck: { name: string; format: DeckFormat },
  entries: DeckCardView[],
  labels: DeckSheetLabels,
): DeckPngLayout {
  const title = `${deck.name} (${labels.formatLabel[deck.format]})`
  const sections: DeckPngSection[] = []

  const character = entries.find((e) => e.zone === 'character')
  if (character) sections.push({ title: labels.character, color: GOLD, cards: [cardCell(character)] })

  const main = entries.filter((e) => e.zone === 'main')
  if (main.length) {
    const mainCount = main.reduce((n, e) => n + e.quantity, 0)
    sections.push({ title: `${labels.mainDeck} (${mainCount})`, color: GOLD, cards: [] })
    for (const [key, list] of groupMainEntries(main)) {
      const count = list.reduce((n, e) => n + e.quantity, 0)
      sections.push({ title: `${labels.group(key)} (${count})`, color: groupColor(key), cards: list.map(cardCell) })
    }
  }

  const sideboard = entries.filter((e) => e.zone === 'sideboard')
  if (sideboard.length) {
    const sideCount = sideboard.reduce((n, e) => n + e.quantity, 0)
    sections.push({ title: `${labels.sideboard} (${sideCount})`, color: GOLD, cards: sideboard.map(cardCell) })
  }

  return { title, sections }
}

// --- Canvas rendering (browser-only) ---

const BG = '#13122A'
const CARD_BG = '#1C1838'
const BORDER = '#2E2A50'
const PARCHMENT = '#FBF3DC'

const SCALE = 2
// Upper bound for either canvas dimension (device px). Browsers cap canvas size
// (desktop ~16k+, some mobile ~4k); past the cap toBlob() yields a blank image.
// Very tall decks scale below SCALE rather than clip to nothing.
const MAX_CANVAS_DIM = 8192
const WIDTH = 980
const PADDING = 36
const TITLE_FONT = '600 28px system-ui, sans-serif'
const SECTION_FONT = '600 16px system-ui, sans-serif'
const LINE_FONT = '400 14px system-ui, sans-serif'
const TITLE_HEIGHT = 48
const SWATCH_SIZE = 12

// Image-grid layout: card thumbnails flow left-to-right, wrapping within the
// content width. Portrait cards are THUMB_W×THUMB_H (5:7); horizontal
// (landscape) cards are the same card at the same scale, rotated: THUMB_H×THUMB_W.
const THUMB_W = 132
const THUMB_H = 185 // round(THUMB_W * 7 / 5)
const GRID_GAP = 12 // horizontal gap between cards
const ROW_GAP = 26 // vertical gap between rows — leaves room for the badge that hangs below each card
const CONTENT_W = WIDTH - PADDING * 2
const SECTION_HEADER_H = 30
const GRID_SECTION_GAP = 16
const BADGE_RADIUS = 14
const BADGE_FILL = GOLD
const BADGE_TEXT = '#1A1730'
const BADGE_FONT = '700 15px system-ui, sans-serif'

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''
const IMG_TIMEOUT_MS = 10_000

// `x`/`y` are the top-left of the drawn card box; `w`/`h` are its size — portrait
// cards are THUMB_W×THUMB_H, horizontal cards THUMB_H×THUMB_W (same scale, rotated).
// Cards sit in rows of uniform THUMB_H height; horizontal cards are centered
// vertically within that row.
export type PositionedCard = { card: DeckPngCard; x: number; y: number; w: number; h: number }
export type PositionedSection = { title: string; color: string; headerY: number; cards: PositionedCard[] }
export type SheetGeometry = { width: number; height: number; sections: PositionedSection[] }

// Drawn box size for a card: horizontal cards render as an upright landscape card.
function cardBox(card: DeckPngCard): { w: number; h: number } {
  return card.orientation === 'horizontal' ? { w: THUMB_H, h: THUMB_W } : { w: THUMB_W, h: THUMB_H }
}

// Positions each card into a flowing, wrapping grid and computes the total canvas
// height. Pure arithmetic — no canvas — so it is unit-tested. Content starts below
// the title; each section contributes a header plus its wrapped rows of
// thumbnails; a card-less section (e.g. the "Main deck (N)" heading) contributes
// only its header. Cards flow left-to-right by their actual width (portrait and
// landscape cards pack tightly with a uniform GRID_GAP), wrapping when the next
// card would overflow the content width.
export function computeSheetGeometry(layout: DeckPngLayout): SheetGeometry {
  const sections: PositionedSection[] = []
  let y = PADDING + TITLE_HEIGHT
  for (const s of layout.sections) {
    const headerY = y
    const gridTop = y + SECTION_HEADER_H
    let x = PADDING
    let rows = s.cards.length ? 1 : 0
    const cards: PositionedCard[] = s.cards.map((card) => {
      const { w, h } = cardBox(card)
      if (x > PADDING && x + w > PADDING + CONTENT_W) { x = PADDING; rows += 1 }
      const rowTop = gridTop + (rows - 1) * (THUMB_H + ROW_GAP)
      const pc: PositionedCard = { card, x, y: rowTop + Math.round((THUMB_H - h) / 2), w, h }
      x += w + GRID_GAP
      return pc
    })
    const gridH = rows > 0 ? rows * THUMB_H + (rows - 1) * ROW_GAP : 0
    sections.push({ title: s.title, color: s.color, headerY, cards })
    y = gridTop + gridH + GRID_SECTION_GAP
  }
  const height = y - GRID_SECTION_GAP + PADDING
  return { width: WIDTH, height, sections }
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

// Loads the full-resolution card image cross-origin so it can be drawn onto the
// canvas and read back via toBlob (the image host sends CORS scoped to the site
// origin). Full art (745px) rather than the 300px thumbnail keeps the exported
// cards crisp on the 2×-scaled canvas. Resolves to null — never rejects — on a
// missing version, load error, or timeout, so one bad image never aborts export.
function loadCardImage(card: DeckPngCard): Promise<HTMLImageElement | null> {
  if (card.imageVersion == null || !IMAGE_BASE) return Promise.resolve(null)
  const url = imageUrl(IMAGE_BASE, imageKey(card.cardId, card.imageVersion))
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    const timer = setTimeout(() => resolve(null), IMG_TIMEOUT_MS)
    img.onload = () => { clearTimeout(timer); resolve(img) }
    img.onerror = () => { clearTimeout(timer); resolve(null) }
    img.src = url
  })
}

// Draws `img` into the cell with object-fit: cover, clipped to the cell box.
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

// Horizontal cards are stored portrait with the landscape art rotated 90°.
// Draw them upright (landscape), rotating the portrait source 90° to cover the
// target box w×h — mirrors CardImage's `upright` behavior.
function drawRotatedUpright(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const cx = x + w / 2
  const cy = y + h / 2
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.translate(cx, cy)
  ctx.rotate(Math.PI / 2)
  // after a 90° turn the box axes swap: local x must cover h, local y cover w
  const scale = Math.max(h / img.naturalWidth, w / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
  ctx.restore()
}

// No-image fallback: a muted tile with the card name, so the sheet still
// conveys the card even when its art is missing or failed to load.
function drawPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, name: string) {
  ctx.fillStyle = CARD_BG
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  ctx.fillStyle = PARCHMENT
  ctx.font = LINE_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(truncateToWidth(ctx, name, w - 16), x + w / 2, y + h / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

// Gold quantity badge straddling the bottom-center edge of a card box (centerX =
// box horizontal center, bottom = box bottom edge) — sits half on the card, half
// below it, so it reads clearly without covering the card's text.
function drawBadge(ctx: CanvasRenderingContext2D, centerX: number, bottom: number, quantity: number) {
  const cx = centerX
  const cy = bottom
  ctx.beginPath()
  ctx.arc(cx, cy, BADGE_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = BADGE_FILL
  ctx.fill()
  ctx.strokeStyle = BG
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.fillStyle = BADGE_TEXT
  ctx.font = BADGE_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(quantity), cx, cy + 1)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

// Renders a shareable deck-sheet PNG entirely client-side (Canvas API — the
// app's CSP forbids pulling in an external image/PDF library). Each card is
// drawn as its full-card thumbnail with a quantity badge, grouped under the
// section headers; canvas height is computed from the grid so nothing clips.
export async function renderDeckPng(
  deck: { name: string; format: DeckFormat },
  entries: DeckCardView[],
  labels: DeckSheetLabels,
): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('renderDeckPng can only run in a browser')

  const layout = layoutDeckSheet(deck, entries, labels)
  const geom = computeSheetGeometry(layout)

  // Preload each distinct card image once (a card can appear in both main and
  // sideboard); a failed/absent image becomes a placeholder (loadCardImage
  // resolves null, never rejects).
  const uniqueCards = new Map<string, DeckPngCard>()
  for (const s of geom.sections) for (const pc of s.cards) uniqueCards.set(pc.card.cardId, pc.card)
  const images = new Map<string, HTMLImageElement | null>()
  await Promise.all(
    [...uniqueCards.values()].map(async (card) => { images.set(card.cardId, await loadCardImage(card)) }),
  )

  // Clamp the device scale so a tall deck never exceeds the browser's max canvas
  // dimension, which would make toBlob() silently return a blank image.
  const scale = Math.min(SCALE, MAX_CANVAS_DIM / geom.width, MAX_CANVAS_DIM / geom.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(geom.width * scale)
  canvas.height = Math.round(geom.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is unavailable')
  ctx.scale(scale, scale)

  // Background sheet: midnight frame around a card-colored panel
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, geom.width, geom.height)
  const FRAME = 8
  ctx.fillStyle = CARD_BG
  ctx.fillRect(FRAME, FRAME, geom.width - FRAME * 2, geom.height - FRAME * 2)
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  ctx.strokeRect(FRAME + 0.5, FRAME + 0.5, geom.width - FRAME * 2 - 1, geom.height - FRAME * 2 - 1)

  // Title
  ctx.fillStyle = GOLD
  ctx.font = TITLE_FONT
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(truncateToWidth(ctx, layout.title, geom.width - PADDING * 2), PADDING, PADDING + 22)

  for (const section of geom.sections) {
    // Section header: color swatch + parchment title, both vertically centered on
    // the same line so the swatch aligns with the text.
    const centerY = section.headerY + SECTION_HEADER_H / 2
    ctx.fillStyle = section.color
    ctx.fillRect(PADDING, centerY - SWATCH_SIZE / 2, SWATCH_SIZE / 3, SWATCH_SIZE)
    ctx.fillStyle = PARCHMENT
    ctx.font = SECTION_FONT
    ctx.textBaseline = 'middle'
    ctx.fillText(truncateToWidth(ctx, section.title, geom.width - PADDING * 2 - 14), PADDING + 12, centerY)
    ctx.textBaseline = 'alphabetic'

    for (const pc of section.cards) {
      const img = images.get(pc.card.cardId) ?? null
      if (pc.card.orientation === 'horizontal') {
        if (img) drawRotatedUpright(ctx, img, pc.x, pc.y, pc.w, pc.h)
        else drawPlaceholder(ctx, pc.x, pc.y, pc.w, pc.h, pc.card.name)
      } else {
        if (img) drawCover(ctx, img, pc.x, pc.y, pc.w, pc.h)
        else drawPlaceholder(ctx, pc.x, pc.y, pc.w, pc.h, pc.card.name)
      }
      drawBadge(ctx, pc.x + pc.w / 2, pc.y + pc.h, pc.card.quantity)
    }
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Failed to render deck PNG'))
    }, 'image/png')
  })
}
