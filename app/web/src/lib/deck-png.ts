import {
  DECK_SHEET,
  DECK_SHEET_COLORS,
  computeSheetGeometry,
  imageKey,
  imageUrl,
  layoutDeckSheet,
  type DeckFormat,
  type DeckSheetCard,
  type DeckSheetEntry,
  type DeckSheetLabels,
} from '@revelio/core'

// Browser painter for the deck sheet. Grouping and geometry come from
// @revelio/core (core/src/deck-sheet.ts), which the Discord bot paints too, so
// the exported PNG and the bot's /deck image cannot drift apart. What stays here
// is Canvas-only: fonts, truncation by measured width and the canvas size cap.

const { background: BG, panel: CARD_BG, border: BORDER, gold: GOLD, parchment: PARCHMENT, badgeText: BADGE_TEXT } = DECK_SHEET_COLORS
const { padding: PADDING, sectionHeaderHeight: SECTION_HEADER_H, swatchSize: SWATCH_SIZE, badgeRadius: BADGE_RADIUS, fontSize } = DECK_SHEET

// Upper bound for either canvas dimension (device px). Browsers cap canvas size
// (desktop ~16k+, some mobile ~4k); past the cap toBlob() yields a blank image.
// Very tall decks scale below DECK_SHEET.scale rather than clip to nothing.
const MAX_CANVAS_DIM = 8192
const TITLE_FONT = `600 ${fontSize.title}px system-ui, sans-serif`
const SECTION_FONT = `600 ${fontSize.section}px system-ui, sans-serif`
const LINE_FONT = `400 ${fontSize.placeholder}px system-ui, sans-serif`
const BADGE_FILL = GOLD
const BADGE_FONT = `700 ${fontSize.badge}px system-ui, sans-serif`

const IMAGE_BASE = process.env.NEXT_PUBLIC_IMAGE_BASE_URL ?? ''
const IMG_TIMEOUT_MS = 10_000

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
function loadCardImage(card: DeckSheetCard): Promise<HTMLImageElement | null> {
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
  entries: DeckSheetEntry[],
  labels: DeckSheetLabels,
): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('renderDeckPng can only run in a browser')

  const layout = layoutDeckSheet(deck, entries, labels)
  const geom = computeSheetGeometry(layout)

  // Preload each distinct card image once (a card can appear in both main and
  // sideboard); a failed/absent image becomes a placeholder (loadCardImage
  // resolves null, never rejects).
  const uniqueCards = new Map<string, DeckSheetCard>()
  for (const s of geom.sections) for (const pc of s.cards) uniqueCards.set(pc.card.cardId, pc.card)
  const images = new Map<string, HTMLImageElement | null>()
  await Promise.all(
    [...uniqueCards.values()].map(async (card) => { images.set(card.cardId, await loadCardImage(card)) }),
  )

  // Clamp the device scale so a tall deck never exceeds the browser's max canvas
  // dimension, which would make toBlob() silently return a blank image.
  const scale = Math.min(DECK_SHEET.scale, MAX_CANVAS_DIM / geom.width, MAX_CANVAS_DIM / geom.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(geom.width * scale)
  canvas.height = Math.round(geom.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context is unavailable')
  ctx.scale(scale, scale)

  // Background sheet: midnight frame around a card-colored panel
  ctx.fillStyle = BG
  ctx.fillRect(0, 0, geom.width, geom.height)
  const FRAME = DECK_SHEET.frame
  ctx.fillStyle = CARD_BG
  ctx.fillRect(FRAME, FRAME, geom.width - FRAME * 2, geom.height - FRAME * 2)
  ctx.strokeStyle = BORDER
  ctx.lineWidth = 1
  ctx.strokeRect(FRAME + 0.5, FRAME + 0.5, geom.width - FRAME * 2 - 1, geom.height - FRAME * 2 - 1)

  // Title
  ctx.fillStyle = GOLD
  ctx.font = TITLE_FONT
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(truncateToWidth(ctx, layout.title, geom.width - PADDING * 2), PADDING, PADDING + DECK_SHEET.titleBaseline)

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
