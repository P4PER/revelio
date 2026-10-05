import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import type { DeckSheetRequest } from '@revelio/core'
import { renderDeckSheet } from '../sheet'

const req: DeckSheetRequest = {
  locale: 'en',
  deck: { name: 'Charms Aggro', format: 'classic' },
  entries: [{
    cardId: 'harry', zone: 'main', quantity: 2, name: 'Harry Potter',
    setCode: 'base', types: ['character'], imageVersion: 1, orientation: null,
  }],
}

beforeEach(() => {
  vi.stubEnv('SHEET_SERVICE_URL', 'http://sheet:8080')
  vi.stubEnv('SHEET_TOKEN', 'a-token-at-least-16-chars')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('renderDeckSheet', () => {
  it('posts the request to the service and returns the bytes with their type', async () => {
    const fetchMock = vi.fn(async () => new Response('png-bytes', {
      status: 200, headers: { 'content-type': 'image/png' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const out = await renderDeckSheet(req)
    expect(out.contentType).toBe('image/png')
    expect(out.body.toString()).toBe('png-bytes')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://sheet:8080/render')
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer a-token-at-least-16-chars')
    // No byte ceiling: a browser download has none, so the service renders at
    // its full pixel cap.
    expect(JSON.parse(init.body as string).maxBytes).toBeUndefined()
  })

  it('throws when the service answers anything but 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 503 })))
    let thrown: unknown
    try { await renderDeckSheet(req) } catch (err) { thrown = err }
    expect((thrown as Error | undefined)?.message).toContain('503')
  })

  it('refuses a 200 that is not an image', async () => {
    // The route serves the answer from this origin with the type it came with,
    // so a misconfigured URL answering HTML must not pass through as a page.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html></html>', {
      status: 200, headers: { 'content-type': 'text/html' },
    })))
    let thrown: unknown
    try { await renderDeckSheet(req) } catch (err) { thrown = err }
    expect((thrown as Error | undefined)?.message).toContain('text/html')
  })

  it('throws a configuration error rather than call an undefined host', async () => {
    vi.stubEnv('SHEET_SERVICE_URL', '')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    let thrown: unknown
    try { await renderDeckSheet(req) } catch (err) { thrown = err }
    expect((thrown as Error | undefined)?.message).toContain('SHEET_SERVICE_URL')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
