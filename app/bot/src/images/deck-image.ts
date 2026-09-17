import sharp, { type OverlayOptions } from 'sharp'
import {
  DECK_SHEET,
  DECK_SHEET_COLORS,
  OTHER_GROUP,
  computeSheetGeometry,
  imageUrl,
  layoutDeckSheet,
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

const S = DECK_SHEET.scale
const FETCH_TIMEOUT_MS = 5000
const MAX_IN_FLIGHT = 8
// Padding either side of a placeholder's card name, as the web painter clamps it.
const PLACEHOLDER_INSET = 16

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
function chromeSvg(geom: SheetGeometry): Buffer {
  const { padding, frame, sectionHeaderHeight, swatchSize } = DECK_SHEET
  const w = geom.width * S
  const h = geom.height * S
  const parts = [
    `<rect width="${w}" height="${h}" fill="${DECK_SHEET_COLORS.background}"/>`,
    `<rect x="${frame * S}" y="${frame * S}" width="${w - frame * 2 * S}" height="${h - frame * 2 * S}"` +
      ` fill="${DECK_SHEET_COLORS.panel}" stroke="${DECK_SHEET_COLORS.border}" stroke-width="${S}"/>`,
  ]
  for (const section of geom.sections) {
    const centerY = (section.headerY + sectionHeaderHeight / 2) * S
    parts.push(
      `<rect x="${padding * S}" y="${centerY - (swatchSize / 2) * S}" width="${(swatchSize / 3) * S}"` +
        ` height="${swatchSize * S}" fill="${section.color}"/>`,
    )
    for (const pc of section.cards) {
      parts.push(
        `<rect x="${pc.x * S + 0.5}" y="${pc.y * S + 0.5}" width="${pc.w * S - 1}" height="${pc.h * S - 1}"` +
          ` fill="${DECK_SHEET_COLORS.panel}" stroke="${DECK_SHEET_COLORS.border}" stroke-width="1"/>`,
      )
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join('')}</svg>`)
}

// The gold disc a quantity sits in, straddling each card's bottom edge.
function badgeSvg(geom: SheetGeometry): Buffer {
  const w = geom.width * S
  const h = geom.height * S
  const circles = geom.sections.flatMap((section) =>
    section.cards.map((pc) =>
      `<circle cx="${(pc.x + pc.w / 2) * S}" cy="${(pc.y + pc.h) * S}" r="${DECK_SHEET.badgeRadius * S}"` +
        ` fill="${DECK_SHEET_COLORS.gold}" stroke="${DECK_SHEET_COLORS.background}" stroke-width="${2 * S}"/>`,
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

async function fetchThumb(card: DeckSheetCard, imageBase: string): Promise<Buffer | null> {
  if (card.imageVersion == null) return null
  try {
    const res = await fetch(imageUrl(imageBase, thumbKey(card.cardId, card.imageVersion)), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

/**
 * The card image for one box, or null for anything that is not a decodable
 * image. Horizontal cards are stored portrait with the art turned a quarter
 * counter-clockwise, so a quarter turn back draws them upright - what
 * drawRotatedUpright does on the web.
 */
async function cardImage(thumb: Buffer, w: number, h: number, upright: boolean): Promise<Buffer | null> {
  try {
    const pipeline = sharp(thumb)
    if (upright) pipeline.rotate(90)
    return await pipeline.resize(w, h, { fit: 'cover' }).png().toBuffer()
  } catch {
    return null
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

// One overlay per card: its image, or the name centered in the empty box. A card
// can appear in two zones, so images are fetched once per distinct card.
async function cardOverlays(
  sections: PositionedSection[],
  imageBase: string,
): Promise<OverlayOptions[]> {
  const positioned = sections.flatMap((section) => section.cards)
  const distinct = [...new Set(positioned.map((pc) => pc.card.cardId))]
  const cardById = new Map(positioned.map((pc) => [pc.card.cardId, pc.card]))
  const thumbs = await mapLimit(distinct, MAX_IN_FLIGHT, (id) => fetchThumb(cardById.get(id)!, imageBase))
  const thumbById = new Map(distinct.map((id, i) => [id, thumbs[i]]))

  return (await Promise.all(positioned.map(async (pc): Promise<OverlayOptions> => {
    const thumb = thumbById.get(pc.card.cardId)
    const image = thumb
      ? await cardImage(thumb, pc.w * S, pc.h * S, pc.card.orientation === 'horizontal')
      : null
    if (image) return { input: image, left: pc.x * S, top: pc.y * S }
    const name = await fitText(
      pc.card.name,
      { size: DECK_SHEET.fontSize.placeholder * S, color: DECK_SHEET_COLORS.parchment },
      (pc.w - PLACEHOLDER_INSET) * S,
    )
    return centered(name, (pc.x + pc.w / 2) * S, (pc.y + pc.h / 2) * S)
  })))
}

async function textOverlays(geom: SheetGeometry, title: string): Promise<OverlayOptions[]> {
  const { padding, titleBaseline, sectionHeaderHeight, swatchSize, fontSize } = DECK_SHEET
  const contentWidth = (geom.width - padding * 2) * S

  const heading = await fitText(title, { size: fontSize.title * S, color: DECK_SHEET_COLORS.gold }, contentWidth)
  // The Canvas painter draws the title on a baseline; center the box on where
  // that baseline puts the x-height instead, which lands in the same place.
  const overlays: OverlayOptions[] = [
    { input: heading.input, left: padding * S, top: Math.round((padding + titleBaseline) * S - heading.height * 0.8) },
  ]

  for (const section of geom.sections) {
    const label = await fitText(
      section.title,
      { size: fontSize.section * S, color: DECK_SHEET_COLORS.parchment },
      contentWidth - 14 * S,
    )
    const centerY = (section.headerY + sectionHeaderHeight / 2) * S
    overlays.push({ input: label.input, left: (padding + swatchSize) * S, top: Math.round(centerY - label.height / 2) })

    for (const pc of section.cards) {
      const quantity = await renderText(String(pc.card.quantity), {
        size: fontSize.badge * S, color: DECK_SHEET_COLORS.badgeText,
      })
      overlays.push(centered(quantity, (pc.x + pc.w / 2) * S, (pc.y + pc.h) * S))
    }
  }
  return overlays
}

/**
 * The deck as a picture: the same sheet web's "Export PNG" downloads, drawn with
 * sharp because the bot has no Canvas. Grouping, geometry and colours come from
 * @revelio/core, so the two cannot drift.
 *
 * Renders from the 300px thumbs rather than the full images the web export uses:
 * at 2x a thumb still covers a card box, and a chat column is no place to spend
 * the bytes. A thumb that cannot be fetched or decoded leaves the placeholder
 * box with the card name, so a missing image never costs the whole reply.
 */
export async function renderDeckImage(deck: PublicDeck, opts: DeckImageOptions): Promise<Buffer> {
  const layout = layoutDeckSheet(deck, deck.entries, labelsFor(opts.locale))
  const geom = computeSheetGeometry(layout)

  const [cards, text] = await Promise.all([
    cardOverlays(geom.sections, opts.imageBase),
    textOverlays(geom, layout.title),
  ])

  return sharp(chromeSvg(geom))
    .composite([...cards, { input: badgeSvg(geom) }, ...text])
    .webp({ quality: 90 })
    .toBuffer()
}
