import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

export type TextStyle = {
  size: number
  color: string
  // Letter-spacing in em. Pango takes it in 1/1024 pt, and at dpi 72 a point is
  // a pixel, so size x tracking x 1024 is exact.
  tracking?: number
  // Only for tests proving the bundled face is the one drawn.
  family?: string
}

// `capTop` and `baseline` are rows of the box: where a capital's top and the
// baseline sit. They are the same for every string of one style, which is what
// lets two strings placed at one top share a baseline.
export type RenderedText = { input: Buffer; width: number; height: number; capTop: number; baseline: number }

// `size` is the one the text was drawn at, which fitText may have stepped down.
export type FittedText = RenderedText & { text: string; size: number }

type LineMetrics = { capTop: number; baseline: number }

// Alpine ships no fonts, so text is drawn from a bundled file. Both files are
// resolved against this module in dev and against sheet.mjs in the bundle, which
// is why build.mjs copies them next to it.
const FONT_FILE = fileURLToPath(new URL('./Poppins-SemiBold.ttf', import.meta.url))
// Without a config file, fontconfig falls back to scanning every system font
// directory on its first text render in each process - 16s on a Mac. This one
// lists only the directory holding the bundled font.
const FONTS_CONF = fileURLToPath(new URL('./fonts.conf', import.meta.url))
const ELLIPSIS = '…'
// Drawn after every string and cropped off again, so the box spans the tallest
// accent and the deepest descender a Latin or German name can reach whatever
// the string itself holds. Measured against the whole of A-ring, E-acute, the
// umlauts, C-cedilla, g, j, y, p and the bar: these two alone reach as far.
const STRUT = ' ÅÇ'
// Per family and size: one render and a row scan, paid once per style.
const metricsCache = new Map<string, Promise<LineMetrics>>()

// Pango markup: the text input parses it, so a card name with & or < would
// otherwise fail the render.
function escapeMarkup(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function span(text: string, style: TextStyle): string {
  const spacing = style.tracking ? ` letter_spacing="${Math.round(style.tracking * style.size * 1024)}"` : ''
  return `<span foreground="${style.color}"${spacing}>${escapeMarkup(text)}</span>`
}

// One line of markup as raw RGBA, sized by libvips to its ink box.
async function draw(markup: string, style: TextStyle): Promise<{ data: Buffer; width: number; height: number }> {
  // Read by fontconfig when it initialises on the first text render, so setting
  // it here, not at import, still takes effect and keeps the module side-effect
  // free. An operator's own setting wins.
  process.env.FONTCONFIG_FILE ??= FONTS_CONF
  const { data, info } = await sharp({
    text: {
      text: markup,
      font: `${style.family ?? 'Poppins'} SemiBold ${style.size}`,
      fontfile: FONT_FILE,
      rgba: true,
      dpi: 72,
    },
  }).raw().toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height }
}

// The text's own ink sets the width; the strut sets the height. The text comes
// first, so it starts at column 0 of both renders and the strut is what the
// crop drops.
async function lineBox(text: string, style: TextStyle): Promise<{ data: Buffer; width: number; height: number }> {
  const [ink, line] = await Promise.all([draw(span(text, style), style), draw(`${span(text, style)}${escapeMarkup(STRUT)}`, style)])
  const width = Math.min(ink.width, line.width)
  const data = Buffer.alloc(width * line.height * 4)
  for (let y = 0; y < line.height; y++) line.data.copy(data, y * width * 4, y * line.width * 4, (y * line.width + width) * 4)
  return { data, width, height: line.height }
}

// Where a capital's top and the baseline land in this style's box, read off an
// H: flat top, flat foot, no overshoot.
function lineMetrics(style: TextStyle): Promise<LineMetrics> {
  const key = `${style.family ?? 'Poppins'}|${style.size}`
  let metrics = metricsCache.get(key)
  if (!metrics) {
    metrics = lineBox('H', { size: style.size, color: '#ffffff', family: style.family }).then(({ data, width, height }) => {
      const inked = (y: number) => { for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 127) return true; return false }
      let capTop = 0
      while (capTop < height && !inked(capTop)) capTop++
      let baseline = height
      while (baseline > capTop && !inked(baseline - 1)) baseline--
      return { capTop, baseline }
    })
    metricsCache.set(key, metrics)
    // A failed measurement is not a fact about the style: left cached, it would
    // fail every later render at this size until the process restarts.
    metrics.catch(() => metricsCache.delete(key))
  }
  return metrics
}

/**
 * One line of Poppins SemiBold as a transparent PNG. As wide as its ink, and
 * as tall as the style's line box, so strings of one style differ only in
 * width.
 */
export async function renderText(text: string, style: TextStyle): Promise<RenderedText> {
  const [box, metrics] = await Promise.all([lineBox(text, style), lineMetrics(style)])
  const input = await sharp(box.data, { raw: { width: box.width, height: box.height, channels: 4 } }).png().toBuffer()
  return { input, width: box.width, height: box.height, ...metrics }
}

// The longest prefix of `text` that fits with an ellipsis. A binary search over
// the length, so an overlong name costs a handful of renders, not one per
// character.
async function cut(text: string, style: TextStyle, maxWidth: number): Promise<FittedText> {
  let lo = 0
  let hi = text.length
  let best: FittedText = { ...await renderText(ELLIPSIS, style), text: ELLIPSIS, size: style.size }
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const candidate = `${text.slice(0, mid).trimEnd()}${ELLIPSIS}`
    const rendered = await renderText(candidate, style)
    if (rendered.width <= maxWidth) {
      lo = mid
      best = { ...rendered, text: candidate, size: style.size }
    } else {
      hi = mid - 1
    }
  }
  return best
}

/**
 * Like renderText, but made to fit `maxWidth`. Given a `minSize`, the size
 * steps down towards it first; only past that is the text cut with an
 * ellipsis. Width is near enough proportional to size that the first guess
 * usually fits, and the loop only walks down from it.
 */
export async function fitText(text: string, style: TextStyle, maxWidth: number, minSize = style.size): Promise<FittedText> {
  const full = await renderText(text, style)
  if (full.width <= maxWidth) return { ...full, text, size: style.size }
  let size = Math.max(minSize, Math.floor((style.size * maxWidth) / full.width))
  while (size < style.size) {
    const rendered = await renderText(text, { ...style, size })
    if (rendered.width <= maxWidth) return { ...rendered, text, size }
    if (size === minSize) break
    size = Math.max(minSize, size - 1)
  }
  return cut(text, { ...style, size: Math.min(style.size, minSize) }, maxWidth)
}
