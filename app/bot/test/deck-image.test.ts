import { describe, it, expect, vi, afterEach } from 'vitest'
import sharp from 'sharp'
import { DECK_SHEET, computeSheetGeometry, layoutDeckSheet, type DeckCardView } from '@revelio/core'
import { MAX_SHEET_PIXELS, renderDeckImage, sheetScale } from '../src/images/deck-image'
import type { PublicDeck } from '../src/data/decks'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function view(cardId: string, zone: DeckCardView['zone'], types: string[], extra: Partial<DeckCardView> = {}): DeckCardView {
  return {
    cardId, zone, quantity: 2, types, name: `Card ${cardId}`, cost: 1, damage: null,
    setCode: 'base', number: '1', lesson: null, isOfficial: true, legality: 'legal',
    isLesson: types.includes('lesson'), isStartingCharacter: zone === 'character',
    imageVersion: 1, artCropVersion: null, orientation: null, ...extra,
  }
}

const entries: DeckCardView[] = [
  view('harry', 'character', ['character'], { quantity: 1, orientation: 'horizontal' }),
  ...Array.from({ length: 8 }, (_, i) => view(`creature${i}`, 'main', ['creature'])),
  view('lesson', 'main', ['lesson'], { quantity: 20 }),
  view('noimg', 'main', ['spell'], { imageVersion: null, name: 'Fred & <George>' }),
  view('side', 'sideboard', ['item']),
]

const deck: PublicDeck = {
  id: 'abc123', name: 'Charms Aggro', format: 'classic', ownerUsername: 'seeker',
  character: null, main: [], sideboard: [], entries,
  mainCount: 38, sideboardCount: 2, topLesson: null, status: 'incomplete',
}

const opts = { imageBase: 'https://img.test', locale: 'en' }

function sheetSize() {
  const labels = {
    formatLabel: { classic: '', revival: '' }, character: '', mainDeck: '', sideboard: '', group: () => '',
  }
  const geom = computeSheetGeometry(layoutDeckSheet(deck, entries, labels))
  return [geom.width * DECK_SHEET.scale, geom.height * DECK_SHEET.scale]
}

// A real 300x420 WebP, like the stored thumbs, so resize and rotate both run.
async function thumb(): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 300, height: 420, channels: 3, background: '#6E66C9' },
  }).webp().toBuffer())
}

describe('renderDeckImage', () => {
  it('renders a PNG at twice the shared sheet geometry', async () => {
    const body = await thumb()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    const meta = await sharp(await renderDeckImage(deck, opts)).metadata()
    expect(meta.format).toBe('png')
    expect([meta.width, meta.height]).toEqual(sheetSize())
  })

  it('falls back to WebP rather than exceed the attachment limit', async () => {
    const body = await thumb()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // One byte, so the fallback runs on any deck rather than needing a huge one.
    const meta = await sharp(await renderDeckImage(deck, { ...opts, maxAttachmentBytes: 1 })).metadata()
    expect(meta.format).toBe('webp')
    expect([meta.width, meta.height]).toEqual(sheetSize())
    expect(warn.mock.calls.flat().join(' ')).toContain('falling back to WebP')
  })

  it('requests default-language thumbs and never fetches a card without an image', async () => {
    const body = await thumb()
    const fetchMock = vi.fn(async (_url: string) => new Response(body, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await renderDeckImage(deck, opts)
    const urls = fetchMock.mock.calls.map(([url]) => String(url))
    expect(urls).toContain('https://img.test/cards/thumb/harry.1.webp')
    expect(urls.some((url) => url.includes('noimg'))).toBe(false)
  })

  it('still renders when every thumb fails to load', async () => {
    // Deliberately broken: the warnings it now raises are asserted on in
    // "renderDeckImage logging", not worth 12 lines of noise here.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const meta = await sharp(await renderDeckImage(deck, opts)).metadata()
    expect([meta.width, meta.height]).toEqual(sheetSize())
  })

  it('treats a non-image response as a missing thumb', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    expect((await sharp(await renderDeckImage(deck, opts)).metadata()).format).toBe('png')
  })

  it('never has more than eight thumbs in flight', async () => {
    const body = await thumb()
    let inFlight = 0
    let peak = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      return new Response(body, { status: 200 })
    }))
    await renderDeckImage(deck, opts)
    expect(peak).toBeLessThanOrEqual(8)
    expect(peak).toBeGreaterThan(1)
  })
})

// 200 distinct main-deck cards: far past the budget, so the clamp has to bite.
const hugeEntries: DeckCardView[] = Array.from({ length: 200 }, (_, i) =>
  view(`creature${i}`, 'main', ['creature']),
)
const hugeDeck: PublicDeck = { ...deck, entries: hugeEntries, mainCount: 400 }

function geomOf(d: PublicDeck, e: DeckCardView[]) {
  const labels = {
    formatLabel: { classic: '', revival: '' }, character: '', mainDeck: '', sideboard: '', group: () => '',
  }
  return computeSheetGeometry(layoutDeckSheet(d, e, labels))
}

describe('sheetScale', () => {
  it('paints a normal deck at the full shared scale', () => {
    expect(sheetScale(geomOf(deck, entries))).toBe(DECK_SHEET.scale)
  })

  it('scales an oversized sheet down to the pixel budget', () => {
    const geom = geomOf(hugeDeck, hugeEntries)
    const scale = sheetScale(geom)
    expect(scale).toBeLessThan(DECK_SHEET.scale)
    expect(geom.width * scale * (geom.height * scale)).toBeLessThanOrEqual(MAX_SHEET_PIXELS)
  })

  it('renders an oversized deck inside the budget', async () => {
    const body = await thumb()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    const meta = await sharp(await renderDeckImage(hugeDeck, opts)).metadata()
    expect(meta.width! * meta.height!).toBeLessThanOrEqual(MAX_SHEET_PIXELS)
    // Still the sheet's aspect ratio, not a clipped or letterboxed one.
    const geom = geomOf(hugeDeck, hugeEntries)
    expect(meta.width! / meta.height!).toBeCloseTo(geom.width / geom.height, 2)
  }, 60_000)
})

describe('renderDeckImage logging', () => {
  it('names the card and the reason when a thumb cannot be fetched', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    await renderDeckImage(deck, opts)
    const lines = warn.mock.calls.map((c) => c.join(' '))
    expect(lines.some((l) => l.includes('harry') && l.includes('ECONNREFUSED'))).toBe(true)
    // One summary line, so a fully broken host is one line plus one per card
    // rather than one per box in the deck.
    expect(lines.filter((l) => l.includes('card images missing'))).toEqual([
      'deck image: 11 of 12 card images missing for deck abc123',
    ])
    warn.mockRestore()
  })

  it('names the card when a fetched body cannot be decoded', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>nope</html>', { status: 200 })))
    await renderDeckImage(deck, opts)
    const lines = warn.mock.calls.map((c) => c.join(' '))
    expect(lines.some((l) => l.includes('decode') && l.includes('harry'))).toBe(true)
    warn.mockRestore()
  })

  it('never logs the image URL', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('nope') }))
    await renderDeckImage(deck, opts)
    expect(warn.mock.calls.flat().join(' ')).not.toContain('img.test')
    warn.mockRestore()
  })

  it('stays silent when every image loads', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const body = await thumb()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    await renderDeckImage(deck, opts)
    expect(warn.mock.calls.filter((c) => c.join(' ').includes('deck image:'))).toHaveLength(0)
    warn.mockRestore()
  })
})
