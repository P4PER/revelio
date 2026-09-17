import sharp, { type OverlayOptions } from 'sharp'
import {
  DECK_SHEET,
  DECK_SHEET_COLORS,
  OTHER_GROUP,
  computeSheetGeometry,
  imageUrl,
  layoutDeckSheet,
  mapLimit,
  thumbKey,
  type DeckSheetCard,
  type DeckSheetLabels,
  type PositionedSection,
  type SheetGeometry,
} from '@revelio/core'
import type { PublicDeck } from '../data/decks'
import { t } from '../i18n/t'
import { fitText, renderText, type RenderedText } from './text'

export type DeckImageOptions = { imageBase: string; locale: string }

// A card's picture, or why its box has none. `failure: null` is a card with no
// stored image at all, which is normal and not worth a log line; a string is a
// failure and is.
type CardImageResult = { body: Buffer } | { failure: string | null }

const FETCH_TIMEOUT_MS = 5000
const MAX_IN_FLIGHT = 8
// Padding either side of a placeholder's card name, as the web painter clamps it.
const PLACEHOLDER_INSET = 16
// Upper bound on the painted sheet, in device pixels. Peak RSS measured on this
// renderer is about 200 MB plus 14.5 MB per megapixel of canvas, so 12 Mpx caps a
// render near 375 MB - see the spec's table. Past the budget the whole sheet scales
// down rather than clipping, which keeps a 200-card deck a readable picture instead
// of an OOM. Deliberately not a DECK_SHEET field: the web painter's cap
// (MAX_CANVAS_DIM in web/src/lib/deck-png.ts) is a browser limit at a different
// number, and one constant cannot mean both.
export const MAX_SHEET_PIXELS = 12_000_000

/**
 * Device pixels per layout pixel for this sheet. DECK_SHEET.scale unless the
 * geometry would exceed MAX_SHEET_PIXELS, in which case both axes shrink by the
 * same factor so the picture keeps its proportions.
 */
export function sheetScale(geom: SheetGeometry): number {
  const budget = Math.sqrt(MAX_SHEET_PIXELS / (geom.width * geom.height))
  return Math.min(DECK_SHEET.scale, budget)
}

// A layout coordinate in device pixels. sharp rejects a fractional composite
// offset or resize dimension, and below the full 2x scale these stop being whole
// numbers on their own.
function px(value: number, s: number): number {
  return Math.round(value * s)
}

// The canvas rounds down so the sheet cannot creep back over MAX_SHEET_PIXELS;
// the lost fraction of a pixel comes out of the padding, never out of a card.
function canvasSize(geom: SheetGeometry, s: number): { w: number; h: number } {
  return { w: Math.floor(geom.width * s), h: Math.floor(geom.height * s) }
}

function labelsFor(locale: string): DeckSheetLabels {
  return {
    formatLabel: {
      classic: t(locale, 'deck.format.classic'),
      revival: t(locale, 'deck.format.revival'),
    },
    character: t(locale, 'deck.sheet.character'),
    mainDeck: t(locale, 'deck.sheet.main'),
    sideboard: t(locale, 'deck.sheet.sideboard'),
    group: (key) => t(locale, `deck.group.${key === OTHER_GROUP ? 'other' : key}`),
  }
}

// Everything that is a shape rather than a glyph or a photo, in one SVG: the
// midnight sheet, the card-coloured panel, a placeholder box per card and the
// section swatches. One overlay instead of several hundred.
function chromeSvg(geom: SheetGeometry, s: number): Buffer {
  const { padding, frame, sectionHeaderHeight, swatchSize } = DECK_SHEET
  const { w, h } = canvasSize(geom, s)
  const parts = [
    `<rect width="${w}" height="${h}" fill="${DECK_SHEET_COLORS.background}"/>`,
    `<rect x="${frame * s}" y="${frame * s}" width="${w - frame * 2 * s}" height="${h - frame * 2 * s}"` +
      ` fill="${DECK_SHEET_COLORS.panel}" stroke="${DECK_SHEET_COLORS.border}" stroke-width="${s}"/>`,
  ]
  for (const section of geom.sections) {
    const centerY = (section.headerY + sectionHeaderHeight / 2) * s
    parts.push(
      `<rect x="${padding * s}" y="${centerY - (swatchSize / 2) * s}" width="${(swatchSize / 3) * s}"` +
        ` height="${swatchSize * s}" fill="${section.color}"/>`,
    )
    for (const pc of section.cards) {
      parts.push(
        `<rect x="${pc.x * s + 0.5}" y="${pc.y * s + 0.5}" width="${pc.w * s - 1}" height="${pc.h * s - 1}"` +
          ` fill="${DECK_SHEET_COLORS.panel}" stroke="${DECK_SHEET_COLORS.border}" stroke-width="1"/>`,
      )
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join('')}</svg>`)
}

// The gold disc a quantity sits in, straddling each card's bottom edge.
function badgeSvg(geom: SheetGeometry, s: number): Buffer {
  const { w, h } = canvasSize(geom, s)
  const circles = geom.sections.flatMap((section) =>
    section.cards.map((pc) =>
      `<circle cx="${(pc.x + pc.w / 2) * s}" cy="${(pc.y + pc.h) * s}" r="${DECK_SHEET.badgeRadius * s}"` +
        ` fill="${DECK_SHEET_COLORS.gold}" stroke="${DECK_SHEET_COLORS.background}" stroke-width="${2 * s}"/>`,
    ),
  )
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${circles.join('')}</svg>`)
}

// Text overlays are positioned by their box, so a baseline or a "middle" from
// the Canvas painter becomes a top-left here.
function centered(rendered: RenderedText, centerX: number, centerY: number): OverlayOptions {
  return {
    input: rendered.input,
    left: Math.round(centerX - rendered.width / 2),
    top: Math.round(centerY - rendered.height / 2),
  }
}

async function fetchThumb(card: DeckSheetCard, imageBase: string): Promise<CardImageResult> {
  if (card.imageVersion == null) return { failure: null }
  try {
    const res = await fetch(imageUrl(imageBase, thumbKey(card.cardId, card.imageVersion)), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return { failure: `HTTP ${res.status}` }
    return { body: Buffer.from(await res.arrayBuffer()) }
  } catch (err) {
    return { failure: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * The card image for one box, or the reason it is not a decodable image.
 * Horizontal cards are stored portrait with the art turned a quarter
 * counter-clockwise, so a quarter turn back draws them upright - what
 * drawRotatedUpright does on the web.
 */
async function cardImage(thumb: Buffer, w: number, h: number, upright: boolean): Promise<CardImageResult> {
  try {
    const pipeline = sharp(thumb)
    if (upright) pipeline.rotate(90)
    return { body: await pipeline.resize(w, h, { fit: 'cover' }).png().toBuffer() }
  } catch (err) {
    return { failure: err instanceof Error ? err.message : String(err) }
  }
}

// One overlay per card: its image, or the name centered in the empty box. A card
// can appear in two zones, so images are fetched once per distinct card, and
// `dropped` counts distinct cards rather than boxes for the same reason.
async function cardOverlays(
  sections: PositionedSection[],
  imageBase: string,
  s: number,
): Promise<{ overlays: OverlayOptions[]; dropped: number; distinct: number }> {
  const positioned = sections.flatMap((section) => section.cards)
  const distinct = [...new Set(positioned.map((pc) => pc.card.cardId))]
  const cardById = new Map(positioned.map((pc) => [pc.card.cardId, pc.card]))
  const thumbs = await mapLimit(distinct, MAX_IN_FLIGHT, (id) => fetchThumb(cardById.get(id)!, imageBase))
  const thumbById = new Map(distinct.map((id, i) => [id, thumbs[i]]))

  // Warned once per distinct card, not once per copy: a card in two zones is one
  // broken image, and a broken host should read as a list of cards, not of boxes.
  const failed = new Set<string>()
  for (const [id, result] of thumbById) {
    if ('body' in result || result.failure === null) continue
    failed.add(id)
    console.warn(`deck image: no art for ${id}: ${result.failure}`)
  }

  // Decoding is capped like fetching, and for the same reason: a 60-card deck
  // decoding, rotating and re-encoding every thumb at once holds all of them in
  // memory, and an OOM kill takes the gateway down rather than one reply.
  const overlays = await mapLimit(positioned, MAX_IN_FLIGHT, async (pc): Promise<OverlayOptions> => {
    const id = pc.card.cardId
    const thumb = thumbById.get(id)!
    const image = 'body' in thumb
      ? await cardImage(thumb.body, px(pc.w, s), px(pc.h, s), pc.card.orientation === 'horizontal')
      : thumb
    if ('body' in image) return { input: image.body, left: px(pc.x, s), top: px(pc.y, s) }
    if (image.failure !== null && !failed.has(id)) {
      failed.add(id)
      console.warn(`deck image: could not decode ${id}: ${image.failure}`)
    }
    const name = await fitText(
      pc.card.name,
      { size: DECK_SHEET.fontSize.placeholder * s, color: DECK_SHEET_COLORS.parchment },
      (pc.w - PLACEHOLDER_INSET) * s,
    )
    return centered(name, (pc.x + pc.w / 2) * s, (pc.y + pc.h / 2) * s)
  })
  return { overlays, dropped: failed.size, distinct: distinct.length }
}

async function textOverlays(geom: SheetGeometry, title: string, s: number): Promise<OverlayOptions[]> {
  const { padding, titleBaseline, sectionHeaderHeight, swatchSize, fontSize } = DECK_SHEET
  const contentWidth = (geom.width - padding * 2) * s

  const heading = await fitText(title, { size: fontSize.title * s, color: DECK_SHEET_COLORS.gold }, contentWidth)
  // The Canvas painter draws the title on a baseline; center the box on where
  // that baseline puts the x-height instead, which lands in the same place.
  const overlays: OverlayOptions[] = [
    { input: heading.input, left: px(padding, s), top: Math.round((padding + titleBaseline) * s - heading.height * 0.8) },
  ]

  for (const section of geom.sections) {
    const label = await fitText(
      section.title,
      { size: fontSize.section * s, color: DECK_SHEET_COLORS.parchment },
      contentWidth - 14 * s,
    )
    const centerY = (section.headerY + sectionHeaderHeight / 2) * s
    overlays.push({ input: label.input, left: px(padding + swatchSize, s), top: Math.round(centerY - label.height / 2) })

    for (const pc of section.cards) {
      const quantity = await renderText(String(pc.card.quantity), {
        size: fontSize.badge * s, color: DECK_SHEET_COLORS.badgeText,
      })
      overlays.push(centered(quantity, (pc.x + pc.w / 2) * s, (pc.y + pc.h) * s))
    }
  }
  return overlays
}

/**
 * The deck as a picture: the same sheet web's "Export PNG" downloads, drawn with
 * sharp because the bot has no Canvas. Grouping, geometry and colours come from
 * @revelio/core, so those cannot drift. Type is where the two do differ - the
 * web paints in system-ui at three weights, this bundles one Poppins face - and
 * only one weight is worth 160 KB in the image.
 *
 * Renders from the 300px thumbs rather than the full images the web export uses:
 * at 2x a thumb still covers a card box, and a chat column is no place to spend
 * the bytes. A thumb that cannot be fetched or decoded leaves the placeholder
 * box with the card name, so a missing image never costs the whole reply.
 */
export async function renderDeckImage(deck: PublicDeck, opts: DeckImageOptions): Promise<Buffer> {
  const layout = layoutDeckSheet(deck, deck.entries, labelsFor(opts.locale))
  const geom = computeSheetGeometry(layout)
  const s = sheetScale(geom)

  const [cards, text] = await Promise.all([
    cardOverlays(geom.sections, opts.imageBase, s),
    textOverlays(geom, layout.title, s),
  ])

  if (cards.dropped > 0) {
    // One line per render, so an unreachable image host is legible in the log
    // instead of being one entry per card in the deck.
    console.warn(`deck image: ${cards.dropped} of ${cards.distinct} card images missing for deck ${deck.id}`)
  }

  return sharp(chromeSvg(geom, s))
    .composite([...cards.overlays, { input: badgeSvg(geom, s) }, ...text])
    .webp({ quality: 90 })
    .toBuffer()
}
