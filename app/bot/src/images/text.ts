import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

export type TextStyle = {
  size: number
  color: string
  // Only for tests proving the bundled face is the one drawn.
  family?: string
}

export type RenderedText = { input: Buffer; width: number; height: number }

export type FittedText = RenderedText & { text: string }

// Alpine ships no fonts, so text is drawn from a bundled file. Both files are
// resolved against this module in dev and against bot.mjs in the bundle, which
// is why build.mjs copies them next to it.
const FONT_FILE = fileURLToPath(new URL('./Poppins-SemiBold.ttf', import.meta.url))
// Without a config file, fontconfig falls back to scanning every system font
// directory on its first text render in each process - 16s on a Mac. This one
// lists only the directory holding the bundled font.
const FONTS_CONF = fileURLToPath(new URL('./fonts.conf', import.meta.url))
const ELLIPSIS = '…'

// Pango markup: the text input parses it, so a card name with & or < would
// otherwise fail the render.
function escapeMarkup(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** One line of Poppins SemiBold as a transparent PNG, sized to its ink box. */
export async function renderText(text: string, style: TextStyle): Promise<RenderedText> {
  // Read by fontconfig when it initialises on the first text render, so setting
  // it here, not at import, still takes effect and keeps the module side-effect
  // free. An operator's own setting wins.
  process.env.FONTCONFIG_FILE ??= FONTS_CONF
  const { data, info } = await sharp({
    text: {
      text: `<span foreground="${style.color}">${escapeMarkup(text)}</span>`,
      font: `${style.family ?? 'Poppins'} SemiBold ${style.size}`,
      fontfile: FONT_FILE,
      rgba: true,
      dpi: 72,
    },
  }).png().toBuffer({ resolveWithObject: true })
  return { input: data, width: info.width, height: info.height }
}

/**
 * Like renderText, but cut with an ellipsis to fit `maxWidth` - the sharp twin of
 * truncateToWidth in web/src/lib/deck-png.ts. A binary search over the length,
 * so an overlong name costs a handful of renders, not one per character.
 */
export async function fitText(text: string, style: TextStyle, maxWidth: number): Promise<FittedText> {
  const full = await renderText(text, style)
  if (full.width <= maxWidth) return { ...full, text }
  let lo = 0
  let hi = text.length
  let best: FittedText = { ...await renderText(ELLIPSIS, style), text: ELLIPSIS }
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const candidate = `${text.slice(0, mid).trimEnd()}${ELLIPSIS}`
    const rendered = await renderText(candidate, style)
    if (rendered.width <= maxWidth) {
      lo = mid
      best = { ...rendered, text: candidate }
    } else {
      hi = mid - 1
    }
  }
  return best
}
