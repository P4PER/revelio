import { describe, it, expect, vi, afterEach } from 'vitest'
import sharp from 'sharp'
import {
  DECK_SHEET, computeSheetGeometry, layoutDeckSheet, sheetLabels,
  type DeckSheetEntry, type DeckSheetRequest,
} from '@revelio/core'
import {
  MAX_SHEET_PIXELS, pixelBudget, renderSheet, sheetScale, usesFullArt,
} from '../src/render'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function entry(cardId: string, zone: DeckSheetEntry['zone'], types: string[], extra: Partial<DeckSheetEntry> = {}): DeckSheetEntry {
  return {
    cardId, zone, quantity: 2, types, name: `Card ${cardId}`, setCode: 'base',
    imageVersion: 1, orientation: null, ...extra,
  }
}

const entries: DeckSheetEntry[] = [
  entry('harry', 'character', ['character'], { quantity: 1, orientation: 'horizontal' }),
  ...Array.from({ length: 8 }, (_, i) => entry(`creature${i}`, 'main', ['creature'])),
  entry('lesson', 'main', ['lesson'], { quantity: 20 }),
  entry('noimg', 'main', ['spell'], { imageVersion: null, name: 'Fred & <George>' }),
  entry('side', 'sideboard', ['item']),
]

const req: DeckSheetRequest = {
  locale: 'en', deck: { name: 'Charms Aggro', format: 'classic' }, entries,
}
const opts = { imageBase: 'https://img.test' }

// 200 distinct main-deck cards: far past the budget, so the clamp has to bite.
const hugeReq: DeckSheetRequest = {
  ...req, entries: Array.from({ length: 200 }, (_, i) => entry(`creature${i}`, 'main', ['creature'])),
}

function sizeOf(r: DeckSheetRequest) {
  const geom = computeSheetGeometry(layoutDeckSheet(r.deck, r.entries, sheetLabels(r.locale)))
  const s = sheetScale(geom, pixelBudget(r.maxBytes))
  return [Math.floor(geom.width * s), Math.floor(geom.height * s)]
}

// A real WebP, so resize and rotate both run. Smaller than a stored card image
// (745x1039) on purpose: the renderer downsamples either way, and the tests
// would pay for the difference on every one of the 200 cards.
async function art(): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 300, height: 420, channels: 3, background: '#6E66C9' },
  }).webp().toBuffer())
}

// Art the PNG encoder cannot squeeze, for the two ceiling cases. Flat colour
// compresses roughly five times better than the real card art the byte-per-
// megapixel figure was measured against, so a flat fixture never reaches the
// ceiling that art does.
async function noisyArt(): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 300, height: 420, channels: 3, noise: { type: 'gaussian', mean: 128, sigma: 110 } },
  }).webp().toBuffer())
}

function recordingFetch(body: Uint8Array): string[] {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(String(url))
    return new Response(body, { status: 200 })
  }))
  return urls
}

describe('pixelBudget', () => {
  it('is the cap when the caller states no ceiling', () => {
    expect(pixelBudget()).toBe(MAX_SHEET_PIXELS)
  })

  // 9 MB of attachment at 1.6 MB per megapixel. This is the number the bot used
  // to hardcode as a second cap.
  it('derives a smaller budget from a byte ceiling', () => {
    expect(Math.round(pixelBudget(9_000_000))).toBe(5_625_000)
  })

  it('never exceeds the cap however large the ceiling', () => {
    expect(pixelBudget(50_000_000)).toBe(MAX_SHEET_PIXELS)
  })
})

describe('sheetScale', () => {
  it('renders a small deck at the full device scale', () => {
    const geom = computeSheetGeometry(layoutDeckSheet(req.deck, req.entries, sheetLabels('en')))
    expect(sheetScale(geom, MAX_SHEET_PIXELS)).toBe(DECK_SHEET.scale)
  })

  it('shrinks both axes by one factor past the budget', () => {
    const geom = computeSheetGeometry(layoutDeckSheet(hugeReq.deck, hugeReq.entries, sheetLabels('en')))
    const s = sheetScale(geom, MAX_SHEET_PIXELS)
    expect(s).toBeLessThan(DECK_SHEET.scale)
    expect(geom.width * s * geom.height * s).toBeLessThanOrEqual(MAX_SHEET_PIXELS)
  })
})

describe('usesFullArt', () => {
  it('draws from full art at the full scale and from thumbs once shrunk', () => {
    expect(usesFullArt(DECK_SHEET.scale)).toBe(true)
    expect(usesFullArt(1)).toBe(false)
  })
})

describe('renderSheet', () => {
  it('renders a PNG at the shared sheet geometry', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const out = await renderSheet(req, opts)
    const meta = await sharp(out.body).metadata()
    expect(meta.format).toBe('png')
    expect(out.contentType).toBe('image/png')
    expect([meta.width, meta.height]).toEqual(sizeOf(req))
    expect(out.pixels).toBe(sizeOf(req)[0] * sizeOf(req)[1])
  })

  // Both ceiling cases pin the pixel budget rather than let maxBytes derive it.
  // The derivation sizes the canvas so the PNG lands AT the ceiling, so only art
  // that compresses worse than PNG_BYTES_PER_MEGAPIXEL overshoots - which real
  // card art does and no fixture does. Pinning the budget is what lets these two
  // cover the encoder branches at all; pixelBudget's own derivation is covered
  // above.
  it('falls back to WebP rather than exceed a stated ceiling', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await noisyArt(), { status: 200 })))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Between this fixture's PNG (~369 KB) and its WebP (~153 KB), so the
    // fallback runs and then fits.
    const out = await renderSheet({ ...req, maxBytes: 300_000 }, { ...opts, pixelBudget: 1_250_000 })
    expect((await sharp(out.body).metadata()).format).toBe('webp')
    expect(out.contentType).toBe('image/webp')
    expect(warn.mock.calls.flat().join(' ')).toContain('falling back to WebP')
  })

  it('throws rather than hand back a WebP that is over the ceiling too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await noisyArt(), { status: 200 })))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let thrown: unknown
    try {
      await renderSheet({ ...req, maxBytes: 100_000 }, { ...opts, pixelBudget: 1_250_000 })
    } catch (err) { thrown = err }
    expect((thrown as Error | undefined)?.message).toMatch(/still over the 100000 byte ceiling/)
  })

  it('requests full art for an ordinary deck and never fetches a card without an image', async () => {
    const urls = recordingFetch(await art())
    await renderSheet(req, opts)
    expect(urls).toContain('https://img.test/cards/harry.1.webp')
    expect(urls.some((url) => url.includes('/cards/thumb/'))).toBe(false)
    expect(urls.some((url) => url.includes('noimg'))).toBe(false)
  })

  it('drops to thumbs once the budget has shrunk the boxes', async () => {
    const urls = recordingFetch(await art())
    const out = await renderSheet(hugeReq, opts)
    expect(urls).toHaveLength(200)
    expect(urls.every((url) => url.includes('/cards/thumb/'))).toBe(true)
    expect(out.fullArt).toBe(false)
  }, 60_000)

  it('still renders when every card image fails, and counts the drops', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = await renderSheet(req, opts)
    expect((await sharp(out.body).metadata()).format).toBe('png')
    expect(out.dropped).toBe(out.distinct - 1) // 'noimg' has no image to drop
    expect(warn.mock.calls.flat().join(' ')).toContain('HTTP 500')
  })

  it('stops fetching once the budget is spent and says so once', async () => {
    // Honours the abort signal, as a real fetch does: the renderer caps each
    // request with AbortSignal.timeout, and a stub that ignored it would hang
    // for FETCH_TIMEOUT_MS instead of ending with the budget.
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>(
      (_resolve, reject) => init.signal!.addEventListener('abort', () => reject(init.signal!.reason)),
    )))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await renderSheet(req, { ...opts, fetchBudgetMs: 50 })
    const logged = warn.mock.calls.flat().join(' ')
    expect(logged).toContain('fetch budget spent')
    expect(logged.match(/never requested/g)).toHaveLength(1)
  })

  it('paints a name that looks like markup as that name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // A placeholder box draws the card name through Pango and the chrome SVG.
    // Neither may treat it as markup - the render must succeed and stay a
    // picture of the string.
    const nasty = { ...req, entries: [entry('x', 'main', ['spell'], { name: '</text><script>&' })] }
    const out = await renderSheet(nasty, opts)
    expect((await sharp(out.body).metadata()).format).toBe('png')
  })

  it('renders a German sheet from core labels alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const out = await renderSheet({ ...req, locale: 'de' }, opts)
    // Same geometry, same bytes-ish: what matters is that no labels were passed
    // in and the render succeeded.
    expect((await sharp(out.body).metadata()).format).toBe('png')
  })
})
