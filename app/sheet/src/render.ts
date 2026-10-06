import sharp, { type OverlayOptions } from 'sharp'
import {
  DECK_SHEET,
  DECK_SHEET_COLORS,
  artCropKey,
  computeSheetGeometry,
  imageKey,
  imageUrl,
  layoutDeckSheet,
  makeupSegments,
  mapLimit,
  sheetLabels,
  thumbKey,
  type DeckSheetBanner,
  type DeckSheetCard,
  type DeckSheetLayout,
  type DeckSheetRequest,
  type PositionedCard,
  type Rect,
  type SheetGeometry,
} from '@revelio/core'
import { fitText, renderText, type RenderedText, type TextStyle } from './text'

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

// Shapes that can only be placed once their text is measured: chip pills,
// legend swatches and the rules beside zone headers. Device pixels.
type Decor = { pills: Rect[]; swatches: (Rect & { color: string })[]; rules: Rect[] }
type TextLayer = { overlays: OverlayOptions[]; decor: Decor }

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
 * At the full 2x that side is 224px against a thumb's 300 - a 1.34:1 repaint of
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

function svg(geom: SheetGeometry, s: number, parts: string[]): Buffer {
  const { w, h } = canvasSize(geom, s)
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${parts.join('')}</svg>`)
}

// Under everything: the midnight sheet, the glow when there is no art, the
// banner card's shadow and gold ring, each card's stacked-copy outlines and
// placeholder box, and the makeup bar.
function baseSvg(geom: SheetGeometry, layout: DeckSheetLayout, s: number, hasArt: boolean): Buffer {
  const C = DECK_SHEET_COLORS
  const r = px(DECK_SHEET.cardRadius, s)
  const { w, h } = canvasSize(geom, s)
  const parts = [
    `<defs>` +
      `<radialGradient id="glow"><stop offset="0" stop-color="${C.gold}" stop-opacity="0.18"/><stop offset="1" stop-color="${C.gold}" stop-opacity="0"/></radialGradient>` +
      `<filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${12 * s}"/></filter>` +
      `<clipPath id="bar"><rect x="${px(geom.banner.bar.x, s)}" y="${px(geom.banner.bar.y, s)}" width="${px(geom.banner.bar.w, s)}" height="${px(geom.banner.bar.h, s)}" rx="${px(geom.banner.bar.h / 2, s)}"/></clipPath>` +
    `</defs>`,
    `<rect width="${w}" height="${h}" fill="${C.background}"/>`,
  ]
  if (!hasArt) parts.push(`<circle cx="${px(DECK_SHEET.width - 300, s)}" cy="${px(140, s)}" r="${px(420, s)}" fill="url(#glow)"/>`)
  const hero = geom.banner.card
  if (hero) {
    parts.push(
      `<rect x="${px(hero.x, s)}" y="${px(hero.y + 14, s)}" width="${px(hero.w, s)}" height="${px(hero.h, s)}" fill="#000" opacity="0.6" filter="url(#shadow)"/>`,
      `<rect x="${px(hero.x - 2, s)}" y="${px(hero.y - 2, s)}" width="${px(hero.w + 4, s)}" height="${px(hero.h + 4, s)}" rx="${px(8, s)}" fill="${C.gold}"/>`,
    )
  }
  const box = (pc: PositionedCard, dx: number, dy: number) =>
    `<rect x="${px(pc.x + dx, s) + 0.5}" y="${px(pc.y - dy, s) + 0.5}" width="${px(pc.w, s) - 1}" height="${px(pc.h, s) - 1}"` +
    ` rx="${r}" fill="${C.panel}" stroke="${C.border}" stroke-width="1"/>`
  for (const zone of geom.zones) {
    for (const group of zone.groups) {
      for (const pc of group.cards) {
        // Farthest copy first, so the nearer one and then the face cover it.
        const off = DECK_SHEET.stackOffset
        if (pc.card.quantity >= 3) parts.push(box(pc, off * 2, off * 2))
        if (pc.card.quantity >= 2) parts.push(box(pc, off, off))
        parts.push(box(pc, 0, 0))
      }
    }
  }
  if (hero) parts.push(box(hero, 0, 0))
  const segments = makeupSegments(layout.banner.makeup, geom.banner.bar)
  if (segments.length) {
    parts.push(`<g clip-path="url(#bar)">${segments.map((g) =>
      `<rect x="${px(g.x, s)}" y="${px(g.y, s)}" width="${px(g.w, s)}" height="${px(g.h, s)}" fill="${g.color}"/>`).join('')}</g>`)
  }
  return svg(geom, s, parts)
}

// Over the art only: fades it into the sheet leftwards and downwards so the
// title and the bar sit on midnight. Drawn only when there is art.
function fadeSvg(geom: SheetGeometry, s: number): Buffer {
  const bg = DECK_SHEET_COLORS.background
  const a = geom.banner.art
  const rect = (fill: string) =>
    `<rect x="${px(a.x, s)}" y="${px(a.y, s)}" width="${px(a.w, s)}" height="${px(a.h, s)}" fill="${fill}"/>`
  return svg(geom, s, [
    `<defs>` +
      `<linearGradient id="fl" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0" stop-color="${bg}" stop-opacity="1"/><stop offset="0.22" stop-color="${bg}" stop-opacity="0.85"/>` +
        `<stop offset="0.6" stop-color="${bg}" stop-opacity="0.15"/><stop offset="1" stop-color="${bg}" stop-opacity="0"/>` +
      `</linearGradient>` +
      `<linearGradient id="fb" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0.6" stop-color="${bg}" stop-opacity="0"/><stop offset="1" stop-color="${bg}" stop-opacity="1"/>` +
      `</linearGradient>` +
    `</defs>`,
    rect('url(#fl)'),
    rect('url(#fb)'),
  ])
}

// Over the cards: chip pills, legend swatches and the zone rules, each placed
// from text the text layer has already measured.
function decorSvg(geom: SheetGeometry, s: number, decor: Decor): Buffer {
  const C = DECK_SHEET_COLORS
  return svg(geom, s, [
    `<defs><linearGradient id="rule" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.border}"/><stop offset="1" stop-color="${C.border}" stop-opacity="0"/></linearGradient></defs>`,
    ...decor.rules.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="url(#rule)"/>`),
    ...decor.swatches.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${2 * s}" fill="${r.color}"/>`),
    ...decor.pills.map((r) =>
      `<rect x="${r.x + s}" y="${r.y + s}" width="${r.w - 2 * s}" height="${r.h - 2 * s}" rx="${(r.h - 2 * s) / 2}"` +
      ` fill="${C.background}" stroke="${C.gold}" stroke-width="${2 * s}"/>`),
  ])
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
async function fetchKey(
  key: string,
  imageBase: string,
  deadline: number,
  signal: AbortSignal | undefined,
): Promise<CardImageResult> {
  const left = deadline - Date.now()
  if (left <= 0) return { failure: BUDGET_SPENT }
  // The reason names the key's card, never the resolved URL: the image base can
  // be an internal hostname and this ends up in a log line.
  const url = containedImageUrl(imageBase, key)
  if (url === null) return { failure: 'key resolves outside the configured image base' }
  try {
    const timeout = AbortSignal.timeout(Math.min(FETCH_TIMEOUT_MS, left))
    const res = await fetch(url, { signal: signal ? AbortSignal.any([timeout, signal]) : timeout })
    if (!res.ok) return { failure: `HTTP ${res.status}` }
    return { body: Buffer.from(await res.arrayBuffer()) }
  } catch (err) {
    return { failure: err instanceof Error ? err.message : String(err) }
  }
}

function fetchCardImage(
  card: DeckSheetCard,
  imageBase: string,
  fullArt: boolean,
  deadline: number,
  signal: AbortSignal | undefined,
): Promise<CardImageResult> {
  if (card.imageVersion == null) return Promise.resolve({ failure: null })
  const key = fullArt ? imageKey : thumbKey
  return fetchKey(key(card.cardId, card.imageVersion), imageBase, deadline, signal)
}

/**
 * The card image for one box, or the reason it is not a decodable image.
 * Horizontal cards are stored portrait with the art turned a quarter
 * counter-clockwise, so a quarter turn back draws them upright - what
 * drawRotatedUpright does on the web.
 */
// Alpha mask for a rounded card: dest-in keeps the image only where this is opaque.
function roundedMask(w: number, h: number, r: number): Buffer {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}"/></svg>`)
}

async function cardImage(source: Buffer, w: number, h: number, upright: boolean, radius: number): Promise<CardImageResult> {
  try {
    const pipeline = sharp(source)
    if (upright) pipeline.rotate(90)
    return {
      body: await pipeline.resize(w, h, { fit: 'cover' })
        .composite([{ input: roundedMask(w, h, radius), blend: 'dest-in' }])
        .png().toBuffer(),
    }
  } catch (err) {
    return { failure: err instanceof Error ? err.message : String(err) }
  }
}

// One overlay per card: its image, or the name centered in the empty box. A card
// can appear in two zones, so images are fetched once per distinct card, and
// `dropped` counts distinct cards rather than boxes for the same reason.
async function cardOverlays(
  positioned: PositionedCard[],
  imageBase: string,
  s: number,
  budgetMs: number,
  signal: AbortSignal | undefined,
): Promise<{ overlays: OverlayOptions[]; dropped: number; distinct: number }> {
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
      ? await cardImage(source.body, px(pc.w, s), px(pc.h, s), pc.card.orientation === 'horizontal', px(DECK_SHEET.cardRadius, s))
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

/**
 * The art crop cut to the banner's art area: scaled to cover it, centred
 * horizontally, and cut focusY of the spare height from the top rather than
 * the middle, because the crops put faces high.
 */
async function coverFocused(source: Buffer, w: number, h: number): Promise<Buffer> {
  const meta = await sharp(source).metadata()
  const k = Math.max(w / meta.width!, h / meta.height!)
  const rw = Math.max(w, Math.ceil(meta.width! * k))
  const rh = Math.max(h, Math.ceil(meta.height! * k))
  return sharp(source)
    .resize(rw, rh)
    .extract({ left: Math.floor((rw - w) / 2), top: Math.round((rh - h) * DECK_SHEET.art.focusY), width: w, height: h })
    .png()
    .toBuffer()
}

// The banner's art overlay, or null for the glow fallback. A crop that fails to
// fetch or decode counts as one dropped image, like a card's.
async function bannerArt(
  banner: DeckSheetBanner,
  area: Rect,
  imageBase: string,
  s: number,
  budgetMs: number,
  signal: AbortSignal | undefined,
): Promise<{ overlay: OverlayOptions | null; dropped: number }> {
  const character = banner.character
  if (!character || character.artCropVersion === null) return { overlay: null, dropped: 0 }
  const id = character.card.cardId
  const fetched = await fetchKey(artCropKey(id, character.artCropVersion), imageBase, Date.now() + budgetMs, signal)
  if (!('body' in fetched)) {
    console.warn(`deck image: no banner art for ${id}: ${fetched.failure}`)
    return { overlay: null, dropped: 1 }
  }
  try {
    const input = await coverFocused(fetched.body, px(area.w, s), px(area.h, s))
    return { overlay: { input, left: px(area.x, s), top: px(area.y, s) }, dropped: 0 }
  } catch (err) {
    console.warn(`deck image: could not decode banner art for ${id}: ${err instanceof Error ? err.message : String(err)}`)
    return { overlay: null, dropped: 1 }
  }
}

async function textOverlays(geom: SheetGeometry, layout: DeckSheetLayout, s: number): Promise<TextLayer> {
  const D = DECK_SHEET
  const C = DECK_SHEET_COLORS
  const right = px(D.width - D.padding, s)
  const overlays: OverlayOptions[] = []
  const decor: Decor = { pills: [], swatches: [], rules: [] }
  const style = (size: number, color: string, tracking?: number): TextStyle => ({ size: size * s, color, tracking })
  const at = (t: RenderedText, left: number, top: number) => { overlays.push({ input: t.input, left: Math.round(left), top: Math.round(top) }); return t }

  // Banner text column.
  const { textX, textWidth } = geom.banner
  const colLeft = px(textX, s)
  const colW = px(textWidth, s)
  at(await fitText(layout.banner.eyebrow, style(D.fontSize.eyebrow, C.gold, D.tracking.eyebrow), colW), colLeft, px(D.text.eyebrowY, s))
  at(await fitText(layout.banner.name, style(D.fontSize.title, C.parchment), colW), colLeft, px(D.text.titleY, s))
  const character = layout.banner.character
  if (character) {
    const label = at(await renderText(character.label, style(D.fontSize.subtitle, C.mutedAccent)), colLeft, px(D.text.subtitleY, s))
    const nameLeft = colLeft + label.width + 6 * s
    at(await fitText(character.card.name, style(D.fontSize.subtitle, C.goldLight), colLeft + colW - nameLeft), nameLeft, px(D.text.subtitleY, s))
  }

  // Legend: swatch, label, count per group, stopping at the bar's right edge
  // rather than running off the canvas (the bar itself still shows every group).
  let cursor = px(geom.banner.bar.x, s)
  const legendTop = px(geom.banner.legendY, s)
  for (const m of layout.banner.makeup) {
    const label = await renderText(m.label, style(D.fontSize.legend, C.mutedAccent))
    const count = await renderText(String(m.count), style(D.fontSize.legend, C.parchment))
    const itemW = 14 * s + label.width + 4 * s + count.width
    if (cursor + itemW > right) break
    decor.swatches.push({ x: cursor, y: legendTop + Math.round((label.height - 8 * s) / 2), w: 8 * s, h: 8 * s, color: m.color })
    at(label, cursor + 14 * s, legendTop)
    at(count, cursor + 14 * s + label.width + 4 * s, legendTop)
    cursor += itemW + 20 * s
  }

  for (const zone of geom.zones) {
    // Zone header: title, count, then a rule that fades out to the right.
    const top = px(zone.headerY, s)
    const title = at(await fitText(zone.title, style(D.fontSize.zone, C.parchment, D.tracking.zone), right - px(D.padding, s)), px(D.padding, s), top)
    const count = at(await renderText(String(zone.count), style(D.fontSize.zone, C.gold)), px(D.padding, s) + title.width + 10 * s, top)
    const ruleLeft = px(D.padding, s) + title.width + 10 * s + count.width + 14 * s
    if (ruleLeft < right) decor.rules.push({ x: ruleLeft, y: top + Math.round(title.height / 2), w: right - ruleLeft, h: Math.max(1, Math.round(s)) })

    for (const group of zone.groups) {
      if (group.title !== null) {
        const left = px(group.x, s)
        const color = group.key === 'lesson' ? C.goldLight : C.mutedAccent
        const label = at(await fitText(group.title, style(D.fontSize.group, color, D.tracking.group), right - left), left, px(group.labelY, s))
        const n = await renderText(String(group.count), style(D.fontSize.group, C.gold))
        const nLeft = left + label.width + 8 * s
        if (nLeft + n.width <= right) at(n, nLeft, px(group.labelY, s))
      }
      for (const pc of group.cards) {
        // xN chip on the bottom-right corner, sized to its digits.
        const sign = await renderText('×', style(D.fontSize.chipSign, C.gold))
        const num = await renderText(String(pc.card.quantity), style(D.fontSize.chip, C.gold))
        const contentW = sign.width + s + num.width
        const pillH = px(D.chip.height, s)
        const pillW = Math.max(px(D.chip.minWidth, s), Math.round(contentW + 2 * D.chip.padX * s))
        const pillRight = px(pc.x + pc.w + D.chip.overhangX, s)
        const pillBottom = px(pc.y + pc.h + D.chip.overhangY, s)
        const pill = { x: pillRight - pillW, y: pillBottom - pillH, w: pillW, h: pillH }
        decor.pills.push(pill)
        const textLeft = pill.x + (pillW - contentW) / 2
        at(sign, textLeft, pill.y + (pillH - sign.height) / 2 + s)
        at(num, textLeft + sign.width + s, pill.y + (pillH - num.height) / 2)
      }
    }
  }
  return { overlays, decor }
}

/**
 * The deck as a picture: the sheet web's "Export PNG" downloads and the Discord
 * bot posts for /deck, drawn once here instead of twice in two runtimes.
 * Grouping, geometry and colours come from @revelio/core, so this process owns
 * no layout. The banner draws the character's art crop when it has one and a
 * gold glow when it does not; either way the layout is the same.
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
  const budgetMs = opts.fetchBudgetMs ?? FETCH_BUDGET_MS
  const positioned = [
    ...(geom.banner.card ? [geom.banner.card] : []),
    ...geom.zones.flatMap((z) => z.groups.flatMap((g) => g.cards)),
  ]

  const fetchStarted = performance.now()
  const [cards, banner, text] = await Promise.all([
    cardOverlays(positioned, opts.imageBase, s, budgetMs, opts.signal),
    bannerArt(layout.banner, geom.banner.art, opts.imageBase, s, budgetMs, opts.signal),
    textOverlays(geom, layout, s),
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
  //
  // Paint order: sheet and placeholders, the art and its fades, the card
  // faces, then the shapes and text that sit on top of them.
  const sheet = sharp(baseSvg(geom, layout, s, banner.overlay !== null)).composite([
    ...(banner.overlay ? [banner.overlay, { input: fadeSvg(geom, s) }] : []),
    ...cards.overlays,
    { input: decorSvg(geom, s, text.decor) },
    ...text.overlays,
  ])
  const dropped = cards.dropped + banner.dropped
  const common = { pixels: w * h, scale: s, fullArt: usesFullArt(s), dropped, distinct: cards.distinct, fetchMs }

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
