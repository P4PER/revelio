import { describe, it, expect, vi, afterEach } from 'vitest'
import sharp from 'sharp'
import { DECK_SHEET, computeSheetGeometry, layoutDeckSheet, type DeckCardView } from '@revelio/core'
import { MAX_SHEET_PIXELS, renderDeckImage, sheetScale, usesFullArt } from '../src/images/deck-image'
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

function geomOf(d: PublicDeck, e: DeckCardView[]) {
  const labels = {
    formatLabel: { classic: '', revival: '' }, character: '', mainDeck: '', sideboard: '', group: () => '',
  }
  return computeSheetGeometry(layoutDeckSheet(d, e, labels))
}

function sheetSize() {
  const geom = geomOf(deck, entries)
  const s = sheetScale(geom)
  return [Math.floor(geom.width * s), Math.floor(geom.height * s)]
}

// A real WebP, so resize and rotate both run. Smaller than a stored card image
// (744x1039) on purpose: the renderer downsamples either way, and the tests would
// pay for the difference on every one of the 200 cards in the oversized deck.
async function thumb(): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 300, height: 420, channels: 3, background: '#6E66C9' },
  }).webp().toBuffer())
}

// 200 distinct main-deck cards: far past the budget, so the clamp has to bite.
const hugeEntries: DeckCardView[] = Array.from({ length: 200 }, (_, i) =>
  view(`creature${i}`, 'main', ['creature']),
)
const hugeDeck: PublicDeck = { ...deck, entries: hugeEntries, mainCount: 400 }

// Stubs fetch with a card image and hands back the list of URLs it is asked for.
function recordingFetch(body: Uint8Array): string[] {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(String(url))
    return new Response(body, { status: 200 })
  }))
  return urls
}

describe('renderDeckImage', () => {
  it('renders a PNG at the shared sheet geometry', async () => {
    const body = await thumb()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    const image = await renderDeckImage(deck, opts)
    const meta = await sharp(image.body).metadata()
    expect(meta.format).toBe('png')
    expect(image.name).toBe('deck.png')
    expect([meta.width, meta.height]).toEqual(sheetSize())
  })

  it('falls back to WebP rather than exceed the attachment limit', async () => {
    const body = await thumb()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Between the fixture's PNG (~89 KB) and its WebP (~49 KB), so the fallback
    // runs on this deck rather than needing a huge one, and then fits.
    const image = await renderDeckImage(deck, { ...opts, maxAttachmentBytes: 60_000 })
    const meta = await sharp(image.body).metadata()
    expect(meta.format).toBe('webp')
    // Named for what it is: media.discordapp.net transcodes by extension, so a
    // WebP under a .png name can come back broken in the embed.
    expect(image.name).toBe('deck.webp')
    expect([meta.width, meta.height]).toEqual(sheetSize())
    expect(warn.mock.calls.flat().join(' ')).toContain('falling back to WebP')
  })

  it('throws rather than hand back a WebP that is over the limit too', async () => {
    const body = await thumb()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Discord fails the whole interaction on an oversized attachment, so /deck
    // has to hear about this and fall back to the list embed.
    let thrown: unknown
    try {
      await renderDeckImage(deck, { ...opts, maxAttachmentBytes: 1 })
    } catch (err) {
      thrown = err
    }
    expect((thrown as Error | undefined)?.message).toMatch(/WebP still over the 1 byte limit/)
  })

  it('requests default-language card images and never fetches a card without an image', async () => {
    const urls = recordingFetch(await thumb())
    await renderDeckImage(deck, opts)
    expect(urls).toContain('https://img.test/cards/harry.1.webp')
    expect(urls.some((url) => url.includes('/cards/thumb/'))).toBe(false)
    expect(urls.some((url) => url.includes('noimg'))).toBe(false)
  })

  it('drops to thumbs once the budget has shrunk the boxes', async () => {
    const urls = recordingFetch(await thumb())
    await renderDeckImage(hugeDeck, opts)
    expect(urls).toHaveLength(200)
    expect(urls.every((url) => url.includes('/cards/thumb/'))).toBe(true)
  }, 60_000)

  it('still renders when every card image fails to load', async () => {
    // Deliberately broken: the warnings it now raises are asserted on in
    // "renderDeckImage logging", not worth 12 lines of noise here.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    const meta = await sharp((await renderDeckImage(deck, opts)).body).metadata()
    expect([meta.width, meta.height]).toEqual(sheetSize())
  })

  it('treats a non-image response as a missing card image', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })))
    expect((await sharp((await renderDeckImage(deck, opts)).body).metadata()).format).toBe('png')
  })

  it('keeps the placeholder frame under the card art at a fractional scale', async () => {
    // The frame and the art are positioned by two different roundings of the
    // same layout coordinate. Below 2x they stop agreeing, and the stroke the
    // art is supposed to cover leaves a partial border line beside the card.
    const body = await thumb()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    const geom = geomOf(deck, entries)
    const s = sheetScale(geom)
    expect(s).toBeLessThan(DECK_SHEET.scale)

    const { data, info } = await sharp((await renderDeckImage(deck, opts)).body)
      .raw().toBuffer({ resolveWithObject: true })
    // Bare panel, to a couple of units: a stroke leaking out reads as a blend of
    // the border into it, and anything else here would be a layout bug of its own.
    const notPanel = (x: number, y: number) => {
      const i = (y * info.width + x) * info.channels
      return ![0x1c, 0x18, 0x38].every((c, k) => Math.abs(data[i + k] - c) <= 4)
    }

    // The ring one pixel outside each card, minus the bottom edge - the quantity
    // badge straddles that one by design.
    const stray: string[] = []
    for (const pc of geom.sections.flatMap((section) => section.cards)) {
      if (pc.card.imageVersion == null) continue
      const [left, top] = [Math.round(pc.x * s), Math.round(pc.y * s)]
      const [right, bottom] = [left + Math.round(pc.w * s) - 1, top + Math.round(pc.h * s) - 1]
      for (let x = left - 1; x <= right + 1; x++) if (notPanel(x, top - 1)) stray.push(`${pc.card.cardId} ${x},${top - 1}`)
      for (let y = top; y <= bottom; y++) {
        for (const x of [left - 1, right + 1]) if (notPanel(x, y)) stray.push(`${pc.card.cardId} ${x},${y}`)
      }
    }
    expect(stray).toEqual([])
  })

  it('abandons the fetch phase once its budget is spent', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dialled: string[] = []
    vi.stubGlobal('fetch', vi.fn((url: string, init: RequestInit) => {
      dialled.push(String(url))
      // Never answers, so only the budget can end it.
      return new Promise((_resolve, reject) => {
        init.signal!.addEventListener('abort', () => reject(init.signal!.reason))
      })
    }))

    const started = Date.now()
    const meta = await sharp((await renderDeckImage(deck, { ...opts, fetchBudgetMs: 150 })).body).metadata()
    // The eight that were in flight when the budget ran out. The three behind
    // them were never dialled, which is the whole point: without the budget
    // every one of them would cost another FETCH_TIMEOUT_MS.
    expect(dialled).toHaveLength(8)
    expect(Date.now() - started).toBeLessThan(5_000)
    expect([meta.width, meta.height]).toEqual(sheetSize())
    // One line for the whole phase, not one per card left in the queue.
    const lines = vi.mocked(console.warn).mock.calls.map((c) => c.join(' '))
    expect(lines.filter((l) => l.includes('never requested'))).toEqual([
      'deck image: fetch budget spent after 150ms, 3 cards never requested',
    ])
  })

  it('never has more than eight card images in flight', async () => {
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

describe('sheetScale', () => {
  it('paints a small deck at the full shared scale', () => {
    // Three cards in two sections: well inside the budget, so nothing clamps.
    const small = [entries[0], entries[1], entries[2]]
    expect(sheetScale(geomOf({ ...deck, entries: small }, small))).toBe(DECK_SHEET.scale)
  })

  // The shared fixture is a dozen entries over six sections, which is already
  // past the budget - section headers cost as much height as the cards do.
  it('scales the shared fixture down', () => {
    expect(sheetScale(geomOf(deck, entries))).toBeLessThan(DECK_SHEET.scale)
  })

  it('scales an oversized sheet down to the pixel budget', () => {
    const geom = geomOf(hugeDeck, hugeEntries)
    const scale = sheetScale(geom)
    expect(scale).toBeLessThan(DECK_SHEET.scale)
    expect(geom.width * scale * (geom.height * scale)).toBeLessThanOrEqual(MAX_SHEET_PIXELS)
  })

  it('draws the fixture and anything smaller from the full card art', () => {
    expect(usesFullArt(sheetScale(geomOf(deck, entries)))).toBe(true)
    expect(usesFullArt(DECK_SHEET.scale)).toBe(true)
  })

  it('draws an oversized deck from the thumbs instead', () => {
    expect(usesFullArt(sheetScale(geomOf(hugeDeck, hugeEntries)))).toBe(false)
  })

  it('renders an oversized deck inside the budget', async () => {
    const body = await thumb()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    const meta = await sharp((await renderDeckImage(hugeDeck, opts)).body).metadata()
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
