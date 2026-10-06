import { describe, it, expect, vi, afterEach } from 'vitest'
import sharp from 'sharp'
import {
  DECK_SHEET, DECK_SHEET_COLORS, computeSheetGeometry, layoutDeckSheet, sheetLabels,
  type DeckSheetEntry, type DeckSheetRequest,
} from '@revelio/core'
import {
  MAX_SHEET_PIXELS, pixelBudget, renderSheet, resolveBudget, sheetScale, usesFullArt,
} from '../src/render'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function entry(cardId: string, zone: DeckSheetEntry['zone'], types: string[], extra: Partial<DeckSheetEntry> = {}): DeckSheetEntry {
  return {
    cardId, zone, quantity: 2, types, name: `Card ${cardId}`, setCode: 'base',
    imageVersion: 1, orientation: null, artCropVersion: null, ...extra,
  }
}

const entries: DeckSheetEntry[] = [
  entry('harry', 'character', ['character'], { quantity: 1, orientation: 'horizontal', artCropVersion: 9 }),
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

// A fetch that never answers but honours its signal exactly as the real one
// does - including the already-aborted case, which real fetch rejects up front
// and an addEventListener-only stub would hang on forever.
function hangingFetch() {
  vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
    const signal = init.signal!
    if (signal.aborted) { reject(signal.reason); return }
    signal.addEventListener('abort', () => reject(signal.reason))
  })))
}

function recordingFetch(body: Uint8Array): string[] {
  const urls: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(String(url))
    return new Response(body, { status: 200 })
  }))
  return urls
}

// RGB of one layout-pixel position on a rendered sheet.
async function pixelAt(png: Buffer, x: number, y: number, s: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  const i = (Math.round(y * s) * info.width + Math.round(x * s)) * info.channels
  return [data[i], data[i + 1], data[i + 2]]
}
const near = ([r, g, b]: number[], hex: string, tol = 24) =>
  [1, 3, 5].every((o, k) => Math.abs([r, g, b][k] - parseInt(hex.slice(o, o + 2), 16)) <= tol)

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

describe('resolveBudget', () => {
  it('is the derived budget when no override is given', () => {
    expect(resolveBudget(undefined, undefined)).toBe(MAX_SHEET_PIXELS)
    expect(Math.round(resolveBudget(9_000_000, undefined))).toBe(5_625_000)
  })

  // The cap pairs with the pod's memory limit, so it has to hold against the
  // override too - otherwise an in-process caller (Phase 4's cache wrapper, a
  // batch path) can paint past what 768Mi is sized for without touching the
  // constant.
  it('clamps an override to the cap', () => {
    expect(resolveBudget(undefined, 100_000_000)).toBe(MAX_SHEET_PIXELS)
    expect(resolveBudget(9_000_000, 100_000_000)).toBe(MAX_SHEET_PIXELS)
  })

  it('lets an override below the cap through', () => {
    expect(resolveBudget(undefined, 1_250_000)).toBe(1_250_000)
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

  it('reports how long the fetch and the encode took', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const out = await renderSheet(req, opts)
    expect(out.fetchMs).toBeGreaterThanOrEqual(0)
    expect(out.encodeMs).toBeGreaterThan(0)
  })

  // The fallback is the slow path; a number that only covered the PNG would hide
  // exactly the render someone is asking about.
  it('counts both encodes when it falls back to WebP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await noisyArt(), { status: 200 })))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Same fixture and ceiling as the fallback test above: the PNG overshoots,
    // the WebP fits.
    const png = await renderSheet(req, { ...opts, pixelBudget: 1_250_000 })
    const webp = await renderSheet({ ...req, maxBytes: 300_000 }, { ...opts, pixelBudget: 1_250_000 })
    expect(webp.contentType).toBe('image/webp')
    // Two encodes against one. Not a strict ratio - timing on a loaded CI box is
    // noisy - only that the second encode was not left out.
    expect(webp.encodeMs).toBeGreaterThan(png.encodeMs)
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
    expect(out.dropped).toBe(out.distinct) // every distinct card but 'noimg', plus the crop
    expect(warn.mock.calls.flat().join(' ')).toContain('HTTP 500')
  })

  it('stops fetching once the budget is spent and says so once', async () => {
    // Honours the abort signal, as a real fetch does: the renderer caps each
    // request with AbortSignal.timeout, and a stub that ignored it would hang
    // for FETCH_TIMEOUT_MS instead of ending with the budget.
    hangingFetch()
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

  // Spec section 9: a render that outlives its deadline, or whose caller has
  // gone, is abandoned rather than finished into a closed socket. The composite
  // and the two encoders are the expensive half, so the one check that matters
  // sits between the fetch phase and them.
  it('abandons the render rather than encode for a caller that has gone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const ac = new AbortController()
    ac.abort(new Error('client went away'))
    let thrown: unknown
    try { await renderSheet(req, { ...opts, signal: ac.signal }) } catch (err) { thrown = err }
    expect((thrown as Error | undefined)?.message).toBe('client went away')
  })

  // Without the signal reaching fetchCardImage this would sit out the whole
  // 30s fetch budget instead of unwinding, which is the behaviour that lets a
  // burst waste the pod's only render slot on sockets nobody is reading.
  it('unwinds the fetch phase as soon as the signal aborts', async () => {
    hangingFetch()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const ac = new AbortController()
    setTimeout(() => ac.abort(new Error('request deadline')), 50)
    const started = Date.now()
    let thrown: unknown
    try { await renderSheet(req, { ...opts, signal: ac.signal }) } catch (err) { thrown = err }
    expect((thrown as Error | undefined)?.message).toBe('request deadline')
    expect(Date.now() - started).toBeLessThan(3_000)
  })

  // Defence in depth behind the contract's cardId allowlist: building a URL is
  // not validating one, because new URL resolves '..' rather than rejecting it.
  // A key that escapes draws a placeholder like any other unusable image - one
  // bad id must not cost the whole picture.
  it('never fetches an image key that escapes the configured base', async () => {
    const urls = recordingFetch(await art())
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // Hand-made rather than parsed: this is the defence that still stands if
    // the allowlist is ever widened.
    const escaping = { ...req, entries: [entry('../../../secret', 'main', ['spell'])] }
    const out = await renderSheet(escaping, opts)
    expect((await sharp(out.body).metadata()).format).toBe('png')
    expect(urls).toEqual([])
    const logged = warn.mock.calls.flat().join(' ')
    expect(logged).toContain('outside the configured image base')
    // The reason names the card, never the base URL.
    expect(logged).not.toContain('img.test')
  })

  // The WHATWG parser does not decode %2e, so an encoded traversal keeps the
  // pathname equal to the one built and slips past the comparison - while the
  // object store on the other end may well decode it.
  it('never fetches a percent-encoded key', async () => {
    const urls = recordingFetch(await art())
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const encoded = { ...req, entries: [entry('..%2f..%2fsecret', 'main', ['spell'])] }
    await renderSheet(encoded, opts)
    expect(urls).toEqual([])
  })

  it('renders a German sheet from core labels alone', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const out = await renderSheet({ ...req, locale: 'de' }, opts)
    // Same geometry, same bytes-ish: what matters is that no labels were passed
    // in and the render succeeded.
    expect((await sharp(out.body).metadata()).format).toBe('png')
  })

  it('fetches the character art crop and paints it on the banner', async () => {
    const urls = recordingFetch(await art())
    const out = await renderSheet(req, opts)
    expect(urls).toContain('https://img.test/cards/art-crop/harry.9.webp')
    // Far right of the banner, above the bottom fade: the crop shows through as is.
    expect(near(await pixelAt(out.body, 1400, 60, out.scale), '#6E66C9')).toBe(true)
  })

  it('draws the glow instead when the character has no crop, and asks for none', async () => {
    const urls = recordingFetch(await art())
    const noCrop = { ...req, entries: req.entries.map((e) => ({ ...e, artCropVersion: null })) }
    const out = await renderSheet(noCrop, opts)
    expect(urls.some((u) => u.includes('/art-crop/'))).toBe(false)
    expect(near(await pixelAt(out.body, 1400, 60, out.scale), '#6E66C9')).toBe(false)
  })

  it('counts a failed crop as dropped and still renders', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      String(url).includes('/art-crop/') ? new Response('nope', { status: 404 }) : new Response(await art(), { status: 200 })))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const out = await renderSheet(req, opts)
    expect(out.dropped).toBe(1)
    expect(warn.mock.calls.flat().join(' ')).toContain('no banner art for harry')
  })

  it('renders a deck without a character', async () => {
    const urls = recordingFetch(await art())
    const out = await renderSheet({ ...req, entries: req.entries.filter((e) => e.zone !== 'character') }, opts)
    expect((await sharp(out.body).metadata()).format).toBe('png')
    expect(urls.some((u) => u.includes('harry'))).toBe(false)
  })

  // Review focus 3: no zones at all.
  it('renders a deck that is only a character', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const only = { ...req, entries: req.entries.filter((e) => e.zone === 'character') }
    const out = await renderSheet(only, opts)
    const meta = await sharp(out.body).metadata()
    expect(meta.height).toBe(Math.floor((DECK_SHEET.bannerHeight + DECK_SHEET.footerHeight) * out.scale))
  })

  // Review focus 1 and 2: the widest title and the widest chip must stay on the
  // canvas - sharp rejects an overlay that runs past its edge, which would fail
  // the whole render.
  it('fits the longest deck name and a 999 chip on the canvas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const wide = {
      ...req,
      deck: { ...req.deck, name: 'W'.repeat(120) },
      entries: [...req.entries, ...Array.from({ length: 9 }, (_, i) => entry(`q${i}`, 'main', ['spell'], { quantity: 999 }))],
    }
    expect((await sharp((await renderSheet(wide, opts)).body).metadata()).format).toBe('png')
    const alone = { ...wide, entries: wide.entries.filter((e) => e.zone !== 'character') }
    expect((await sharp((await renderSheet(alone, opts)).body).metadata()).format).toBe('png')
  })

  // Review focus 4 and 5: every group, German labels, and a one-card group whose
  // label is wider than its card landing in the last column.
  it('keeps every legend item and group label inside the canvas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const types = ['creature', 'spell', 'item', 'adventure', 'location', 'event', 'match', 'lesson', 'unknown_type']
    const every: DeckSheetRequest = {
      ...req, locale: 'de',
      entries: [
        ...Array.from({ length: 9 }, (_, i) => entry(`fill${i}`, 'main', ['creature'])),
        ...types.map((t) => entry(`one-${t}`, 'main', [t], { quantity: 999 })),
      ],
    }
    expect((await sharp((await renderSheet(every, opts)).body).metadata()).format).toBe('png')
  })

  it('draws the logo in the footer corner', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const out = await renderSheet(req, opts)
    const geom = computeSheetGeometry(layoutDeckSheet(req.deck, req.entries, sheetLabels('en')))
    const { data, info } = await sharp(out.body)
      .extract({
        left: Math.round(geom.logo.x * out.scale), top: Math.round(geom.logo.y * out.scale),
        width: Math.round(geom.logo.w * out.scale), height: Math.round(geom.logo.h * out.scale),
      })
      .raw().toBuffer({ resolveWithObject: true })
    // The wordmark is parchment (#FBF3DC); nothing else in the footer is that light.
    let light = 0
    for (let i = 0; i < data.length; i += info.channels) if (data[i] > 220 && data[i + 1] > 220) light++
    expect(light).toBeGreaterThan(50)
  })

  // Spec section 4 draws the bar above the fades. Under them, the left fade's
  // solid midnight hid every segment past the art's left edge, Lessons included.
  it('draws the makeup bar over the art fades, out to the content edge', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const out = await renderSheet(req, opts)
    // The last segment is Lessons, gold, and ends flush at 1400.
    expect(near(await pixelAt(out.body, 1395, 259, out.scale), DECK_SHEET_COLORS.group.lesson)).toBe(true)
  })

  // Copies are counted by the chip alone. The outlines stacked behind a card
  // read as a drop shadow rather than as more copies.
  it('draws nothing behind a card with several copies', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(await art(), { status: 200 })))
    const out = await renderSheet(req, opts)
    const geom = computeSheetGeometry(layoutDeckSheet(req.deck, req.entries, sheetLabels('en')))
    const pc = geom.zones[0].groups.flatMap((g) => g.cards).find((c) => c.card.quantity >= 3)!
    // In the card gap, where the first outline's right edge used to show.
    expect(near(await pixelAt(out.body, pc.x + pc.w + 3, pc.y + pc.h / 2, out.scale), DECK_SHEET_COLORS.background, 3)).toBe(true)
  })

  // The title column runs on into the art, where the fade is only about half
  // midnight; on bright art the parchment title needs its own shadow to read.
  it('lifts the banner title off bright art with a shadow', async () => {
    const bright = new Uint8Array(await sharp({ create: { width: 300, height: 420, channels: 3, background: '#F4EBD0' } }).webp().toBuffer())
    vi.stubGlobal('fetch', vi.fn(async () => new Response(bright, { status: 200 })))
    const short = await renderSheet({ ...req, deck: { ...req.deck, name: 'W' } }, opts)
    const long = await renderSheet({ ...req, deck: { ...req.deck, name: 'W'.repeat(40) } }, opts)
    // Just under the title's baseline, out over the art: W has no descender, so
    // only a shadow puts anything here.
    const lum = ([r, g, b]: number[]) => (r + g + b) / 3
    const at = (out: typeof short) => pixelAt(out.body, 880, DECK_SHEET.text.titleY + 36, out.scale)
    expect(lum(await at(long))).toBeLessThan(lum(await at(short)) - 10)
  })
})
