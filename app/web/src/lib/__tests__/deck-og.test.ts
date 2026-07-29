import { describe, it, expect, vi, afterEach } from 'vitest'
import sharp from 'sharp'
import { pickStarterArt, deckLessonCodes, fetchArtCropPng } from '../deck-og'

const starter = { isStartingCharacter: true, cardId: 'c1', artCropVersion: 3 }
const other = { isStartingCharacter: false, cardId: 'c2', artCropVersion: 9 }

describe('pickStarterArt', () => {
  it('builds the art-crop URL for the starting character', () => {
    const url = pickStarterArt([other, starter], 'https://img.example')
    expect(url).toContain('https://img.example')
    expect(url).toContain('c1')
  })
  it('returns null when there is no starting character', () => {
    expect(pickStarterArt([other], 'https://img.example')).toBeNull()
  })
  it('returns null when the starter has no art crop', () => {
    expect(pickStarterArt([{ ...starter, artCropVersion: null }], 'https://img.example')).toBeNull()
  })
  it('returns null when the image base is empty', () => {
    expect(pickStarterArt([starter], '')).toBeNull()
  })
})

describe('deckLessonCodes', () => {
  it('returns distinct, non-null lesson codes', () => {
    const views = [{ lesson: 'charms' }, { lesson: null }, { lesson: 'charms' }, { lesson: 'potions' }]
    expect(deckLessonCodes(views)).toEqual(['charms', 'potions'])
  })
  it('orders by the canonical lesson list, not card insertion order', () => {
    // canonical: care_of_magical_creatures, charms, potions, transfiguration, quidditch
    const views = [{ lesson: 'quidditch' }, { lesson: 'charms' }, { lesson: 'potions' }]
    expect(deckLessonCodes(views)).toEqual(['charms', 'potions', 'quidditch'])
  })
})

describe('fetchArtCropPng', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('transcodes a fetched WebP art crop into a PNG data URI', async () => {
    const webp = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .webp()
      .toBuffer()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(webp, { status: 200, headers: { 'content-type': 'image/webp' } })),
    )
    const uri = await fetchArtCropPng('https://img.example/x.webp')
    expect(uri).toMatch(/^data:image\/png;base64,/)
    // Decode the result back and confirm satori would receive a real PNG.
    const meta = await sharp(Buffer.from(uri!.split(',')[1], 'base64')).metadata()
    expect(meta.format).toBe('png')
  })
  it('returns null on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect(await fetchArtCropPng('https://img.example/x')).toBeNull()
  })
  it('returns null when fetch throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network')
      }),
    )
    expect(await fetchArtCropPng('https://img.example/x')).toBeNull()
  })
  it('returns null when the bytes are not a decodable image', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })))
    expect(await fetchArtCropPng('https://img.example/x')).toBeNull()
  })
})
