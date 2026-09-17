import sharp, { type OverlayOptions } from 'sharp'
import {
  DECK_SHEET,
  DECK_SHEET_COLORS,
  OTHER_GROUP,
  computeSheetGeometry,
  imageKey,
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

export type DeckImageOptions = {
  imageBase: string
  locale: string
  // Test seam. Production never sets it; the default is Discord's practical
  // ceiling for a non-boosted guild, with headroom under the real 10 MB.
  maxAttachmentBytes?: number
  // Test seam, so a test can spend the budget without waiting out FETCH_BUDGET_MS.
  fetchBudgetMs?: number
}

// The rendered sheet and the file name it has to be uploaded under. Discord
// sniffs the content, but media.discordapp.net keys its transcoding off the
// extension, so a WebP served as .png can come back broken in the embed even
// though the attachment downloads fine. The embed can only reference an
// attachment by name, so the name travels with the bytes rather than being
// assumed by either side.
export type DeckImage = { body: Buffer; name: string }

// A card's picture, or why its box has none. `failure: null` is a card with no
// stored image at all, which is normal and not worth a log line; a string is a
// failure and is.
type CardImageResult = { body: Buffer } | { failure: string | null }

// Matches web's IMG_TIMEOUT_MS. The full card image is ~317 KB against a thumb's
// ~23 KB, so the 5s that covered a thumb does not cover this.
const FETCH_TIMEOUT_MS = 10_000
// Wall clock for the whole fetch phase. A per-request timeout bounds one card,
// not the render: at MAX_IN_FLIGHT a 200-card deck against a black-holed host
// serialises 25 waves of FETCH_TIMEOUT_MS, so /deck would sit on a deferral for
// four minutes before falling back to the list. That is the misconfiguration
// IMAGE_FETCH_BASE_URL exists to make possible, so it is worth bounding: past
// this, the cards still outstanding draw as placeholders.
const FETCH_BUDGET_MS = 30_000
// Discord rejects an attachment over 10 MB in a non-boosted guild, and the whole
// interaction fails with it. The pixel budget already puts the worst PNG near
// 6 MB, so this is a backstop rather than a working limit - but a failed upload
// costs the reply, and a re-encode costs a second.
const MAX_ATTACHMENT_BYTES = 9_000_000
const MAX_IN_FLIGHT = 8
// Padding either side of a placeholder's card name, as the web painter clamps it.
const PLACEHOLDER_INSET = 16
// Width of a stored thumb, baked by card-data/accio_images.py and web's upload
// action; the full image beside it is 745 wide.
const THUMB_WIDTH = 300
// How far a thumb must be able to shrink before it is worth drawing from. Below
// this it is painted near 1:1 and carries its own webp artefacts into the sheet,
// which is what the full art is for.
const MIN_THUMB_DOWNSCALE = 1.5
// Why a card was never asked for, rather than why its request failed. One render
// spends the budget once, so these collapse into a single log line instead of
// repeating the same sentence for every card still in the queue.
const BUDGET_SPENT = 'fetch budget spent'
// Upper bound on the painted sheet, in device pixels. Two things scale with canvas
// area and this bounds both: peak RSS, at roughly 215 MB plus 28 MB per megapixel,
// and the encoded PNG, at roughly 1.6 MB per megapixel. At 5 Mpx a 60-entry deck
// measures 358 MB / 7.8 MB and a 200-entry one 405 MB / 8.2 MB, so every deck fits
// MAX_ATTACHMENT_BYTES and a 640Mi pod. Past the budget the whole sheet scales down
// rather than clipping, which keeps a 200-card deck a readable picture instead of
// an OOM.
//
// The spec's 12 Mpx was derived from thumb sources. Full card art costs about twice
// the memory and four times the PNG bytes per megapixel, measured on this branch,
// which is what put the budget here instead. Deliberately not a DECK_SHEET field:
// the web painter's cap (MAX_CANVAS_DIM in web/src/lib/deck-png.ts) is a browser
// limit at a different number, and one constant cannot mean both.
export const MAX_SHEET_PIXELS = 5_000_000

/**
 * Device pixels per layout pixel for this sheet. DECK_SHEET.scale unless the
 * geometry would exceed MAX_SHEET_PIXELS, in which case both axes shrink by the
 * same factor so the picture keeps its proportions.
 */
export function sheetScale(geom: SheetGeometry): number {
  const budget = Math.sqrt(MAX_SHEET_PIXELS / (geom.width * geom.height))
  return Math.min(DECK_SHEET.scale, budget)
}

/**
 * Whether this sheet is worth drawing from the full card images rather than the
 * thumbs. One decision per render, not per card: every box is the same card at
 * the same scale, and DECK_SHEET.cardWidth * s is the short side of all of them,
 * portrait or turned.
 *
 * At the full 2x that side is 264px against a thumb's 300 - a 1.14:1 repaint of
 * an already lossy source, which is what the full art buys off. Once the pixel
 * budget pulls the scale down the thumb has real headroom instead, and a
 * 100-entry deck would otherwise pull ~31 MB of art to paint 154px boxes.
 */
export function usesFullArt(s: number): boolean {
  return DECK_SHEET.cardWidth * s * MIN_THUMB_DOWNSCALE > THUMB_WIDTH
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
      // Rounded exactly as the card overlay is, so the 1px stroke lands on the
      // outermost pixel of the box the art covers. At a fractional scale the raw
      // coordinates round the other way for some cards and the border shows.
      parts.push(
        `<rect x="${px(pc.x, s) + 0.5}" y="${px(pc.y, s) + 0.5}" width="${px(pc.w, s) - 1}" height="${px(pc.h, s) - 1}"` +
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

// `deadline` is an epoch millisecond, shared by every fetch in one render, and
// clamping each request's own timeout to what is left of it is what holds the
// phase to its budget rather than to the budget plus one more timeout.
async function fetchCardImage(
  card: DeckSheetCard,
  imageBase: string,
  fullArt: boolean,
  deadline: number,
): Promise<CardImageResult> {
  if (card.imageVersion == null) return { failure: null }
  const left = deadline - Date.now()
  if (left <= 0) return { failure: BUDGET_SPENT }
  const key = fullArt ? imageKey : thumbKey
  try {
    const res = await fetch(imageUrl(imageBase, key(card.cardId, card.imageVersion)), {
      signal: AbortSignal.timeout(Math.min(FETCH_TIMEOUT_MS, left)),
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
async function cardImage(source: Buffer, w: number, h: number, upright: boolean): Promise<CardImageResult> {
  try {
    const pipeline = sharp(source)
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
  budgetMs: number,
): Promise<{ overlays: OverlayOptions[]; dropped: number; distinct: number }> {
  const positioned = sections.flatMap((section) => section.cards)
  const distinct = [...new Set(positioned.map((pc) => pc.card.cardId))]
  const cardById = new Map(positioned.map((pc) => [pc.card.cardId, pc.card]))
  const fullArt = usesFullArt(s)
  const deadline = Date.now() + budgetMs
  const fetched = await mapLimit(distinct, MAX_IN_FLIGHT, (id) =>
    fetchCardImage(cardById.get(id)!, imageBase, fullArt, deadline))
  const imageById = new Map(distinct.map((id, i) => [id, fetched[i]]))

  // Warned once per distinct card, not once per copy: a card in two zones is one
  // broken image, and a broken host should read as a list of cards, not of boxes.
  const failed = new Set<string>()
  let unrequested = 0
  for (const [id, result] of imageById) {
    if ('body' in result || result.failure === null) continue
    failed.add(id)
    if (result.failure === BUDGET_SPENT) unrequested += 1
    else console.warn(`deck image: no art for ${id}: ${result.failure}`)
  }
  if (unrequested > 0) {
    console.warn(`deck image: ${BUDGET_SPENT} after ${budgetMs}ms, ${unrequested} cards never requested`)
  }

  // Decoding is capped like fetching, and for the same reason: a 60-card deck
  // decoding, rotating and re-encoding every image at once holds all of them in
  // memory, and an OOM kill takes the gateway down rather than one reply.
  const overlays = await mapLimit(positioned, MAX_IN_FLIGHT, async (pc): Promise<OverlayOptions> => {
    const id = pc.card.cardId
    const source = imageById.get(id)!
    const image = 'body' in source
      ? await cardImage(source.body, px(pc.w, s), px(pc.h, s), pc.card.orientation === 'horizontal')
      : source
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
 * The source is picked per sheet by usesFullArt: full card images while the
 * boxes are big enough for a thumb to show its own compression, the thumbs once
 * the pixel budget has shrunk them. An image that cannot be fetched or decoded
 * leaves the placeholder box with the card name, so a missing image never costs
 * the whole reply.
 */
export async function renderDeckImage(deck: PublicDeck, opts: DeckImageOptions): Promise<DeckImage> {
  const layout = layoutDeckSheet(deck, deck.entries, labelsFor(opts.locale))
  const geom = computeSheetGeometry(layout)
  const s = sheetScale(geom)

  const [cards, text] = await Promise.all([
    cardOverlays(geom.sections, opts.imageBase, s, opts.fetchBudgetMs ?? FETCH_BUDGET_MS),
    textOverlays(geom, layout.title, s),
  ])

  if (cards.dropped > 0) {
    // One line per render, so an unreachable image host is legible in the log
    // instead of being one entry per card in the deck.
    console.warn(`deck image: ${cards.dropped} of ${cards.distinct} card images missing for deck ${deck.id}`)
  }

  // clone() because a sharp pipeline cannot be consumed twice: without it the
  // fallback would re-encode a finished pipeline and throw.
  const sheet = sharp(chromeSvg(geom, s)).composite([...cards.overlays, { input: badgeSvg(geom, s) }, ...text])

  // PNG so the file people pull out of Discord is lossless and ordinary. The
  // card images it is drawn from are already lossy, so webp q90 was a second
  // generation of loss on top of them for no gain.
  const png = await sheet.clone().png({ compressionLevel: 9 }).toBuffer()
  const limit = opts.maxAttachmentBytes ?? MAX_ATTACHMENT_BYTES
  if (png.length <= limit) return { body: png, name: 'deck.png' }

  console.warn(`deck image: ${png.length} byte PNG over the ${limit} byte limit, falling back to WebP`)
  const webp = await sheet.clone().webp({ quality: 90 }).toBuffer()
  // The limit is checked again rather than assumed: q90 is normally a fifth of
  // the PNG, but an attachment Discord rejects fails the whole interaction, and
  // /deck answers a throw with the list embed it can always draw.
  if (webp.length > limit) {
    throw new Error(`deck image: ${webp.length} byte WebP still over the ${limit} byte limit`)
  }
  return { body: webp, name: 'deck.webp' }
}
