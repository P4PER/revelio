import { describe, it, expect, vi, afterEach } from 'vitest'
import type { DeckSheetCard } from '@revelio/core'

// The module reads the image base at import time, the way next inlines it at
// build, so the stub has to be in place before it loads.
vi.stubEnv('NEXT_PUBLIC_IMAGE_BASE_URL', 'https://img.test')
const { loadCardImage } = await import('../deck-png')

const card: DeckSheetCard = {
  cardId: 'bs-accio', quantity: 1, name: 'Accio', setCode: 'BS', imageVersion: 7, orientation: null,
}

function stubBitmap() {
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 745, height: 1040 })))
}

afterEach(() => { vi.unstubAllGlobals() })

describe('loadCardImage', () => {
  /**
   * The card pages load the same URLs as plain <img>, which send no Origin, and
   * the image host only answers with Access-Control-Allow-Origin when a request
   * carries one. The response cached from that page view therefore has no CORS
   * header, and reusing it for the export's cross-origin read fails - leaving a
   * placeholder where the card should be, for as long as the entry lives (card
   * images are immutable for a year). Going past the cache is what avoids it.
   */
  it('fetches past the HTTP cache so a plain page view cannot poison the export', async () => {
    const fetchMock = vi.fn(async () => new Response(new Blob([new Uint8Array([1])]), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    stubBitmap()

    const image = await loadCardImage(card)

    expect(image).not.toBeNull()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/cards/bs-accio.7.webp')
    expect(init.cache).toBe('reload')
    expect(init.mode).toBe('cors')
  })

  it('resolves null rather than throwing when the image cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    stubBitmap()
    expect(await loadCardImage(card)).toBeNull()
  })

  it('resolves null on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    stubBitmap()
    expect(await loadCardImage(card)).toBeNull()
  })

  it('never fetches a card that has no image', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await loadCardImage({ ...card, imageVersion: null })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
