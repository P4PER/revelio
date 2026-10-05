import sharp, { type OverlayOptions } from 'sharp'
import {
  DECK_SHEET,
  DECK_SHEET_COLORS,
  computeSheetGeometry,
  imageKey,
  imageUrl,
  layoutDeckSheet,
  mapLimit,
  sheetLabels,
  thumbKey,
  type DeckSheetCard,
  type DeckSheetRequest,
  type PositionedSection,
  type SheetGeometry,
} from '@revelio/core'
import { fitText, renderText, type RenderedText } from './text'

export type SheetRenderOptions = {
  imageBase: string
  // Test seam, so a test can spend the budget without waiting out FETCH_BUDGET_MS.
  fetchBudgetMs?: number
  // Test seam for the pixel budget, which is otherwise derived from
  // req.maxBytes. The encoder fallback below needs a canvas the byte ceiling
  // cannot hold, and the derivation exists precisely to stop producing one: it
  // sizes the canvas so the PNG lands at the ceiling, so only art that
  // compresses worse than PNG_BYTES_PER_MEGAPIXEL overshoots it. Real card art
  // sits right at that figure and does overshoot; no synthetic fixture comes
  // close, so the fallback is unreachable from the two inputs alone.
  pixelBudget?: number
  // Abandons the render: the caller's socket closed, or the service's request
  // deadline passed. Spec section 9 - a render that outlives its deadline is
  // abandoned rather than finished into a closed socket, because the single
  // render slot is the thing a burst would otherwise waste.
  signal?: AbortSignal
}

// The rendered sheet and everything the caller needs to say what it got. The
// content type travels with the bytes because the two can disagree: the WebP
// fallback is still a deck sheet, and media.discordapp.net transcodes by the
// extension the uploader picks from this.
export type SheetRender = {
  body: Buffer
  contentType: 'image/png' | 'image/webp'
  pixels: number
  scale: number
  fullArt: boolean
  dropped: number
  distinct: number
  // Wall clock, in ms. fetchMs covers the art fetch and decode and the text
  // overlays, which run together; encodeMs covers the composite and every encode,
  // because sharp composites lazily inside toBuffer and the two cannot be told
  // apart without paying for a raw encode.
  fetchMs: number
  encodeMs: number
}

// A card's picture, or why its box has none. `failure: null` is a card with no
// stored image at all, which is normal and not worth a log line; a string is a
// failure and is.
type CardImageResult = { body: Buffer } | { failure: string | null }

// Matches web's old browser painter. The full card image is ~317 KB against a
// thumb's ~23 KB, so the 5s that covered a thumb does not cover this.
const FETCH_TIMEOUT_MS = 10_000
// Wall clock for the whole fetch phase. A per-request timeout bounds one card,
// not the render: at MAX_IN_FLIGHT a 200-card deck against a black-holed host
// serialises 25 waves of FETCH_TIMEOUT_MS, so a render would sit for four
// minutes before answering. Past this, the cards still outstanding draw as
// placeholders.
const FETCH_BUDGET_MS = 30_000
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
// Upper bound on the painted sheet, in device pixels, and the only pixel cap in
// the system - the browser painter's per-axis MAX_CANVAS_DIM went away with the
// canvas. Two things scale with canvas area and this bounds both: peak RSS, at
// roughly 215 MB plus 28 MB per megapixel, and the encoded PNG, at roughly
// 1.6 MB per megapixel. At 12 Mpx that is ~551 MB, which is what the pod's
// 768Mi limit is sized for. Not an env var on purpose: it is one half of a pair
// with that limit, and a value an operator can raise on its own will be raised
// past it.
export const MAX_SHEET_PIXELS = 12_000_000
// Measured bytes of PNG per megapixel of sheet, on the deployed branch and
// against real card art. Used to turn a caller's byte ceiling into a pixel
// budget; art content moves the real figure around it, which is why the encoded
// size is measured afterwards rather than trusted.
export const PNG_BYTES_PER_MEGAPIXEL = 1_600_000

/**
 * Pixels this render may paint. The cap, or less when the caller has stated a
 * byte ceiling it has to fit - /deck sends Discord's attachment limit, a
 * browser download sends none. This is what replaced the bot's second cap: the
 * 5 Mpx it used to hardcode was always a consequence of a 9 MB attachment,
 * not a property of the sheet.
 */
export function pixelBudget(maxBytes?: number): number {
  if (maxBytes === undefined) return MAX_SHEET_PIXELS
  return Math.min(MAX_SHEET_PIXELS, (maxBytes / PNG_BYTES_PER_MEGAPIXEL) * 1_000_000)
}

/**
 * The pixel budget a render actually gets: the derived one, or an explicit
 * override, but never past MAX_SHEET_PIXELS either way. The cap is one half of
 * a pair with the pod's memory limit, so it is enforced here rather than inside
 * pixelBudget alone - an override that could step over it would move the cap
 * without touching the constant.
 */
export function resolveBudget(maxBytes: number | undefined, override: number | undefined): number {
  return Math.min(MAX_SHEET_PIXELS, override ?? pixelBudget(maxBytes))
}

/**
 * Device pixels per layout pixel for this sheet. DECK_SHEET.scale unless the
 * geometry would exceed the budget, in which case both axes shrink by the same
 * factor so the picture keeps its proportions.
 */
export function sheetScale(geom: SheetGeometry, budget: number): number {
  return Math.min(DECK_SHEET.scale, Math.sqrt(budget / (geom.width * geom.height)))
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

/**
 * The art URL for one card, or null when the key would land outside the
 * configured base. Building a URL is not validating one: new URL resolves a
 * '..' segment rather than rejecting it, so the check is canonicalize-then-
 * compare, the same shape as a realpath prefix check on a filesystem.
 *
 * The contract's cardId allowlist is what makes this unreachable today; this is
 * what still holds if that allowlist is ever widened.
 */
function containedImageUrl(imageBase: string, key: string): string | null {
  // Before any parsing: the WHATWG parser leaves %2e alone, so an encoded
  // traversal keeps the pathname identical to the one built here and sails
  // through the comparison below - while the object store on the other end may
  // decode it and serve the escaped path. No key the image helpers produce
  // contains a percent, so refusing one costs nothing.
  if (key.includes('%')) return null
  const url = imageUrl(imageBase, key)
  try {
    const base = new URL(`${imageBase.replace(/\/$/, '')}/`)
    const resolved = new URL(url)
    // Exact match, not a prefix test: a prefix test passes trivially when the
    // base has no path of its own, and "did the parser have to change this?" is
    // the question that actually distinguishes a well-formed key. A '..'
    // segment or a stray backslash moves the pathname; nothing a real key
    // contains does. The origin is compared separately because a key starting
    // '//' would otherwise be read as an authority.
    if (resolved.origin !== base.origin) return null
    if (resolved.pathname !== `${base.pathname}${key}`) return null
    return url
  } catch {
    return null
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
  signal: AbortSignal | undefined,
): Promise<CardImageResult> {
  if (card.imageVersion == null) return { failure: null }
  const left = deadline - Date.now()
  if (left <= 0) return { failure: BUDGET_SPENT }
  const key = fullArt ? imageKey : thumbKey
  // The reason names the card, never the resolved URL: the image base can be an
  // internal hostname and this ends up in a log line.
  const url = containedImageUrl(imageBase, key(card.cardId, card.imageVersion))
  if (url === null) return { failure: 'key resolves outside the configured image base' }
  try {
    // The per-card timeout and the render's own abandonment are both reasons to
    // stop dialling, so the request carries whichever fires first.
    const timeout = AbortSignal.timeout(Math.min(FETCH_TIMEOUT_MS, left))
    const res = await fetch(url, {
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
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
  signal: AbortSignal | undefined,
): Promise<{ overlays: OverlayOptions[]; dropped: number; distinct: number }> {
  const positioned = sections.flatMap((section) => section.cards)
  const distinct = [...new Set(positioned.map((pc) => pc.card.cardId))]
  const cardById = new Map(positioned.map((pc) => [pc.card.cardId, pc.card]))
  const fullArt = usesFullArt(s)
  const deadline = Date.now() + budgetMs
  const fetched = await mapLimit(distinct, MAX_IN_FLIGHT, (id) =>
    fetchCardImage(cardById.get(id)!, imageBase, fullArt, deadline, signal))
  // Checked before the failures are logged and before anything is decoded: an
  // abandoned render should cost neither a screenful of warnings about images
  // nobody will see nor the decode of every card in the deck.
  signal?.throwIfAborted()
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
 * The deck as a picture: the sheet web's "Export PNG" downloads and the Discord
 * bot posts for /deck, drawn once here instead of twice in two runtimes.
 * Grouping, geometry and colours come from @revelio/core, so this process owns
 * no layout.
 *
 * The art source is picked per sheet by usesFullArt: full card images while the
 * boxes are big enough for a thumb to show its own compression, the thumbs once
 * the pixel budget has shrunk them. An image that cannot be fetched or decoded
 * leaves the placeholder box with the card name, so a missing image never costs
 * the whole picture.
 */
export async function renderSheet(req: DeckSheetRequest, opts: SheetRenderOptions): Promise<SheetRender> {
  const layout = layoutDeckSheet(req.deck, req.entries, sheetLabels(req.locale))
  const geom = computeSheetGeometry(layout)
  const s = sheetScale(geom, resolveBudget(req.maxBytes, opts.pixelBudget))
  const { w, h } = canvasSize(geom, s)

  const fetchStarted = performance.now()
  const [cards, text] = await Promise.all([
    cardOverlays(geom.sections, opts.imageBase, s, opts.fetchBudgetMs ?? FETCH_BUDGET_MS, opts.signal),
    textOverlays(geom, layout.title, s),
  ])
  const fetchMs = Math.round(performance.now() - fetchStarted)
  // The composite and the two encoders are the expensive half and cannot be
  // interrupted once started, so this is the last point where abandoning is
  // still cheap.
  opts.signal?.throwIfAborted()

  // clone() because a sharp pipeline cannot be consumed twice: without it the
  // fallback would re-encode a finished pipeline and throw. Encoding the
  // composite once into raw pixels and feeding both encoders from it was
  // measured and rejected - it pays 22ms and 9 MB on the path that always runs
  // to save 170ms on the one that should never fire.
  const sheet = sharp(chromeSvg(geom, s)).composite([...cards.overlays, { input: badgeSvg(geom, s) }, ...text])
  const common = { pixels: w * h, scale: s, fullArt: usesFullArt(s), dropped: cards.dropped, distinct: cards.distinct, fetchMs }

  // PNG so the file people pull out of Discord, or out of their downloads, is
  // lossless and ordinary. The card images it is drawn from are already lossy,
  // so webp q90 was a second generation of loss on top of them for no gain.
  //
  // compressionLevel is zlib effort, not quality - PNG is lossless at every
  // level, so this trades encode time against bytes and nothing else. 6 is
  // sharp's own default and where the curve flattens: measured on a 8.9 Mpx
  // sheet built from 60 real card images, level 9 costs 522ms for 13.209 MB
  // against level 6's 281ms for 13.330 MB. Paying 241ms of the render budget
  // for 0.9% of the file is the wrong way round, and the byte ceiling is
  // measured after encoding anyway, so the fallback still catches an overshoot.
  // performance.now() rather than Date.now(): it is monotonic, so a clock step
  // mid-render cannot produce a negative duration.
  const encodeStarted = performance.now()
  const encodeMs = () => Math.round(performance.now() - encodeStarted)
  const png = await sheet.clone().png({ compressionLevel: 6 }).toBuffer()
  if (req.maxBytes === undefined || png.length <= req.maxBytes) {
    return { body: png, contentType: 'image/png', ...common, encodeMs: encodeMs() }
  }

  console.warn(`sheet: ${png.length} byte PNG over the ${req.maxBytes} byte ceiling, falling back to WebP`)
  const webp = await sheet.clone().webp({ quality: 90 }).toBuffer()
  // Measured again rather than assumed: q90 is normally a fifth of the PNG, but
  // an attachment Discord rejects fails the whole interaction, and /deck
  // answers a failed render with the list embed it can always draw.
  if (webp.length > req.maxBytes) {
    throw new Error(`sheet: ${webp.length} byte WebP still over the ${req.maxBytes} byte ceiling`)
  }
  return { body: webp, contentType: 'image/webp', ...common, encodeMs: encodeMs() }
}
