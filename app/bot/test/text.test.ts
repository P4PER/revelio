import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { fitText, renderText } from '../src/images/text'

async function pixels(input: Buffer): Promise<Buffer> {
  return sharp(input).raw().toBuffer()
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
})
