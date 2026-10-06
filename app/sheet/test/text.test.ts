import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { fitText, renderText } from '../src/text'

async function pixels(input: Buffer): Promise<Buffer> {
  return sharp(input).raw().toBuffer()
}

// First row with ink, and the row after the last one.
async function inkRows(input: Buffer): Promise<[number, number]> {
  const { data, info } = await sharp(input).raw().toBuffer({ resolveWithObject: true })
  const rows: number[] = []
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] > 127) { rows.push(y); break }
    }
  }
  return [rows[0], rows[rows.length - 1] + 1]
}

describe('renderText', () => {
  it('draws ink rather than an empty box', async () => {
    const out = await renderText('Gary Rattly Quest', { size: 32, color: '#ffffff' })
    const raw = await pixels(out.input)
    // Alpha is the last of the four channels: any non-zero alpha is a drawn glyph.
    expect(raw.filter((_, i) => i % 4 === 3).some((alpha) => alpha > 0)).toBe(true)
  })

  // fonts.conf lists only the directory holding Poppins, so it is the single
  // family fontconfig knows and an unmatched name cannot silently substitute
  // another face. Asserting the identity is what keeps that guarantee: were the
  // config to stop applying, a system font would answer here and differ.
  it('cannot fall back to another face', async () => {
    const poppins = await renderText('Gary Rattly Quest', { size: 32, color: '#ffffff' })
    const unmatched = await renderText('Gary Rattly Quest', { size: 32, color: '#ffffff', family: 'Nonexistent Family' })
    expect(unmatched.width).toBe(poppins.width)
    expect((await pixels(unmatched.input)).equals(await pixels(poppins.input))).toBe(true)
  })

  // The text input parses Pango markup, so an unescaped card name with & or <
  // would fail the whole image.
  it('renders text that looks like markup', async () => {
    const out = await renderText('Fred & <George>', { size: 16, color: '#fff' })
    expect(out.width).toBeGreaterThan(0)
  })

  // Uppercase labels are set with tracking, as the mock does with letter-spacing.
  it('spreads glyphs apart when tracking is set', async () => {
    const plain = await renderText('MAIN DECK', { size: 26, color: '#ffffff' })
    const tracked = await renderText('MAIN DECK', { size: 26, color: '#ffffff', tracking: 0.2 })
    // Eight gaps between nine glyphs at 0.2em of 26px is ~42px wider.
    expect(tracked.width - plain.width).toBeGreaterThan(30)
  })

  // Labels sit side by side and are placed by the top of their box. A box
  // cropped to its ink put a word with an umlaut or no descender higher or
  // lower than its neighbour, so every string of one style gets the same box,
  // with the cap line and the baseline at the same rows in it.
  it('gives every string of one style the same box and baseline', async () => {
    const style = { size: 100, color: '#ffffff' }
    const boxes = await Promise.all(
      ['ZAUBER', 'GEGENSTÄNDE', 'Starting character', 'Fred & George Weasley', 'acme'].map((t) => renderText(t, style)),
    )
    for (const b of boxes) expect([b.height, b.capTop, b.baseline]).toEqual([boxes[0].height, boxes[0].capTop, boxes[0].baseline])
    // Poppins' cap height is about 0.7em.
    expect(boxes[0].baseline - boxes[0].capTop).toBeGreaterThan(65)
    expect(boxes[0].baseline - boxes[0].capTop).toBeLessThan(76)
  })

  it('reports the rows its glyphs actually sit on', async () => {
    const out = await renderText('H', { size: 100, color: '#ffffff' })
    const [top, bottom] = await inkRows(out.input)
    expect(Math.abs(top - out.capTop)).toBeLessThanOrEqual(1)
    expect(Math.abs(bottom - out.baseline)).toBeLessThanOrEqual(1)
  })
})

describe('fitText', () => {
  it('leaves text that fits alone', async () => {
    const out = await fitText('Short', { size: 16, color: '#fff' }, 500)
    expect(out.text).toBe('Short')
  })

  it('cuts overlong text with an ellipsis inside the width', async () => {
    const out = await fitText('A card name that is far too long for its box', { size: 16, color: '#fff' }, 120)
    expect(out.text.endsWith('…')).toBe(true)
    expect(out.width).toBeLessThanOrEqual(120)
    expect(out.text.length).toBeGreaterThan(1)
  })

  // A deck title shrinks before it loses characters: the banner has room for
  // a smaller title, and the name is the one thing the reader came for.
  it('steps the size down before it cuts', async () => {
    const style = { size: 44, color: '#fff' }
    const full = await renderText('Adventure Snuffling Corner', style)
    const out = await fitText('Adventure Snuffling Corner', style, full.width - 40, 32)
    expect(out.text).toBe('Adventure Snuffling Corner')
    expect(out.size).toBeLessThan(44)
    expect(out.size).toBeGreaterThanOrEqual(32)
    expect(out.width).toBeLessThanOrEqual(full.width - 40)
  })

  it('cuts at the smallest size once stepping down is not enough', async () => {
    const out = await fitText('W'.repeat(120), { size: 44, color: '#fff' }, 600, 32)
    expect(out.size).toBe(32)
    expect(out.text.endsWith('…')).toBe(true)
    expect(out.width).toBeLessThanOrEqual(600)
  })
})
