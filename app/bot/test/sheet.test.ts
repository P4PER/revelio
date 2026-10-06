import { describe, it, expect, vi, afterEach } from 'vitest'
import type { DeckCardView } from '@revelio/core'
import { requestDeckSheet } from '../src/data/sheet'
import type { PublicDeck } from '../src/data/decks'
import type { BotEnv } from '../src/env'

afterEach(() => { vi.unstubAllGlobals() })

function view(cardId: string): DeckCardView {
  return {
    cardId, zone: 'main', quantity: 2, name: `Card ${cardId}`, cost: 3, damage: null,
    setCode: 'base', number: '1', lesson: null, isOfficial: true, legality: 'legal',
    isLesson: false, isStartingCharacter: false, imageVersion: 4, artCropVersion: null,
    orientation: null, types: ['creature'],
  }
}

const deck = {
  id: 'abc', name: 'Charms Aggro', format: 'classic', ownerUsername: 'seeker',
  character: null, main: [], sideboard: [], entries: [view('harry')],
  mainCount: 2, sideboardCount: 0, topLesson: null, status: 'legal',
} as unknown as PublicDeck

const env = {
  SHEET_SERVICE_URL: 'http://sheet:8080',
  SHEET_TOKEN: 'a-token-at-least-16-chars',
} as unknown as BotEnv

function stubFetch(body: string, init: ResponseInit) {
  const fetchMock = vi.fn(async () => new Response(body, init))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('requestDeckSheet', () => {
  it("posts the sheet contract with Discord's byte ceiling", async () => {
    const fetchMock = stubFetch('png-bytes', { status: 200, headers: { 'content-type': 'image/png' } })
    const out = await requestDeckSheet(deck, 'de', env)

    expect(out.name).toBe('deck.png')
    expect(out.body.toString()).toBe('png-bytes')
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://sheet:8080/render')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer a-token-at-least-16-chars')
    const sent = JSON.parse(init.body as string)
    expect(sent.locale).toBe('de')
    expect(sent.maxBytes).toBe(9_000_000)
    expect(sent.deck).toEqual({ name: 'Charms Aggro', format: 'classic' })
    // Narrowed to the painted fields: cost and legality never reach a pixel and
    // would only widen the service's cache key.
    expect(sent.entries[0]).toEqual({
      cardId: 'harry', zone: 'main', quantity: 2, name: 'Card harry',
      setCode: 'base', types: ['creature'], imageVersion: 4, orientation: null,
      artCropVersion: null,
    })
  })

  it('names the attachment for the format it got back', async () => {
    stubFetch('webp-bytes', { status: 200, headers: { 'content-type': 'image/webp' } })
    expect((await requestDeckSheet(deck, 'en', env)).name).toBe('deck.webp')
  })

  it('falls back to English for a locale the sheet has no labels for', async () => {
    const fetchMock = stubFetch('png', { status: 200, headers: { 'content-type': 'image/png' } })
    await requestDeckSheet(deck, 'fr', env)
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).locale).toBe('en')
  })

  it('throws on any non-200 so /deck can fall back to the list', async () => {
    for (const status of [401, 400, 500, 503]) {
      stubFetch('nope', { status })
      let thrown: unknown
      try { await requestDeckSheet(deck, 'en', env) } catch (err) { thrown = err }
      expect((thrown as Error | undefined)?.message).toContain(String(status))
    }
  })

  it('throws when the service never answers', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fetch failed') }))
    let thrown: unknown
    try { await requestDeckSheet(deck, 'en', env) } catch (err) { thrown = err }
    expect(thrown).toBeInstanceOf(Error)
  })

  // Media types are case-insensitive, and the name is the only thing standing
  // between WebP bytes and media.discordapp.net transcoding them as a PNG.
  it('matches the content type without regard to case', async () => {
    stubFetch('webp-bytes', { status: 200, headers: { 'content-type': 'Image/WEBP; charset=binary' } })
    expect((await requestDeckSheet(deck, 'en', env)).name).toBe('deck.webp')
  })

  it('throws rather than upload a 200 that is not an image', async () => {
    for (const type of ['text/html', 'application/json', '']) {
      stubFetch('<html>not a sheet</html>', { status: 200, headers: type ? { 'content-type': type } : {} })
      let thrown: unknown
      try { await requestDeckSheet(deck, 'en', env) } catch (err) { thrown = err }
      // An embed pointing at a non-image attachment is a broken picture; the
      // list embed is strictly better, and only a throw reaches it.
      expect((thrown as Error | undefined)?.message).toContain('image')
    }
  })

  it('refuses a body larger than the ceiling it asked for', async () => {
    stubFetch('png', {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(9_000_001) },
    })
    let thrown: unknown
    try { await requestDeckSheet(deck, 'en', env) } catch (err) { thrown = err }
    // Buffered into the gateway's heap otherwise, on a pod sized at 256Mi now
    // that it draws nothing.
    expect((thrown as Error | undefined)?.message).toContain('too large')
  })

  // Headers.get joins duplicates with ', ' and a chunked answer carries no
  // length at all, so a declared size is a cheap early exit and never the
  // guarantee: the read itself is what has to be bounded.
  it('refuses a body that overruns the ceiling without declaring it', async () => {
    for (const headers of [
      { 'content-type': 'image/png' },
      { 'content-type': 'image/png', 'content-length': 'not-a-number' },
    ]) {
      const oversized = new Uint8Array(9_000_001)
      vi.stubGlobal('fetch', vi.fn(async () => new Response(oversized, { status: 200, headers })))
      let thrown: unknown
      try { await requestDeckSheet(deck, 'en', env) } catch (err) { thrown = err }
      expect((thrown as Error | undefined)?.message).toContain('too large')
    }
  })

  // A proxy in front of the service may re-chunk the response, and a client that
  // demanded a declared length would answer every deck with the list embed.
  it('accepts a sheet whose length is not declared', async () => {
    const stream = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([137, 80, 78, 71])); controller.close() },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(stream, {
      status: 200, headers: { 'content-type': 'image/png' },
    })))
    const out = await requestDeckSheet(deck, 'en', env)
    expect(out.body.length).toBe(4)
  })

  it('does not follow a redirect', async () => {
    const fetchMock = stubFetch('png', { status: 200, headers: { 'content-type': 'image/png' } })
    await requestDeckSheet(deck, 'en', env)
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].redirect).toBe('error')
  })

  it('trims a trailing slash off the service URL', async () => {
    const fetchMock = stubFetch('png', { status: 200, headers: { 'content-type': 'image/png' } })
    await requestDeckSheet(deck, 'en', { ...env, SHEET_SERVICE_URL: 'http://sheet:8080/' })
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('http://sheet:8080/render')
  })
})
