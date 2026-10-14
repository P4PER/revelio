import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import sharp from 'sharp'
import { createServer } from 'node:http'
import { DeckSheetRequest, MAX_SHEET_ENTRIES, SHEET_FIELD_LIMITS } from '@revelio/core'
import { createSheetServer, listen, MAX_BODY_BYTES } from '../src/server'

const env = { PORT: 0, IMAGE_BASE_URL: 'https://img.test', SHEET_TOKEN: 'a-token-at-least-16-chars' }
const server = createSheetServer(env)
let base = ''

const body: DeckSheetRequest = {
  locale: 'en',
  deck: { name: 'Charms Aggro', format: 'classic' },
  entries: [{
    // No image version: every card draws as a placeholder, so these tests make no
    // outbound request and still exercise a real render.
    cardId: 'harry', zone: 'main', quantity: 2, name: 'Harry Potter',
    setCode: 'base', types: ['character'], imageVersion: null, orientation: null,
    artCropVersion: null,
  }],
}

async function post(payload: unknown, token = env.SHEET_TOKEN, init: RequestInit = {}) {
  return fetch(`${base}/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
    ...init,
  })
}

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

describe('the render service', () => {
  it('answers a health check without a token', async () => {
    const res = await fetch(`${base}/health`)
    expect(res.status).toBe(200)
  })

  it('renders a PNG and describes it in headers', async () => {
    const res = await post(body)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(Number(res.headers.get('x-sheet-pixels'))).toBeGreaterThan(0)
    expect(res.headers.get('x-sheet-scale')).toBeTruthy()
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).format).toBe('png')
  })

  it('reports the render phases in Server-Timing', async () => {
    const res = await post(body)
    const timing = res.headers.get('server-timing') ?? ''
    expect(timing).toMatch(/queue;dur=\d+/)
    expect(timing).toMatch(/fetch;dur=\d+/)
    expect(timing).toMatch(/encode;dur=\d+/)
  })

  it('logs one line per render, with no deck content in it', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await post(body)
    const lines = log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('sheet: render '))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/outcome=rendered digest=[0-9a-f]{16} entries=1 /)
    expect(lines[0]).toMatch(/fetchMs=\d+ encodeMs=\d+ bytes=\d+ type=png$/)
    // The deck title and the card name are user input.
    expect(lines[0]).not.toContain('Charms Aggro')
    expect(lines[0]).not.toContain('Harry Potter')
    log.mockRestore()
  })

  // The digest is what lets repeat requests be counted from the logs, which is
  // the evidence spec section 5 waits for before building a sheet cache.
  it('gives the same request the same digest and a different deck another', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await post(body)
    await post(body)
    await post({ ...body, deck: { ...body.deck, name: 'Other' } })
    const digests = log.mock.calls
      .map((c) => /digest=([0-9a-f]+)/.exec(String(c[0]))?.[1])
      .filter(Boolean)
    expect(digests).toHaveLength(3)
    expect(digests[0]).toBe(digests[1])
    expect(digests[2]).not.toBe(digests[0])
    log.mockRestore()
  })

  it('rejects a missing or wrong token without rendering', async () => {
    expect((await post(body, 'wrong-token-but-long-enough')).status).toBe(401)
    const res = await fetch(`${base}/render`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    expect(res.status).toBe(401)
  })

  it('rejects a body that is not a sheet request', async () => {
    expect((await post({ locale: 'fr', deck: body.deck, entries: body.entries })).status).toBe(400)
    expect((await post({ ...body, entries: [] })).status).toBe(400)
    expect((await post('not json at all')).status).toBe(400)
  })

  it('rejects an oversized body before parsing it', async () => {
    // Past MAX_BODY_BYTES, which no request the contract accepts can reach - so
    // this is a body that is not one, and it is refused without being parsed.
    const huge = { ...body, deck: { ...body.deck, name: 'x'.repeat(MAX_BODY_BYTES + 1) } }
    expect((await post(huge)).status).toBe(413)
  })

  it('404s anything but the two routes', async () => {
    expect((await fetch(`${base}/`)).status).toBe(404)
    expect((await fetch(`${base}/render`)).status).toBe(404) // GET
  })

  // main() answers a start-up failure with 'sheet failed to start:', and
  // sheet/Dockerfile greps the build for exactly that prefix. A listen error
  // emitted with no listener is rethrown as an uncaught exception instead, so
  // the one failure an operator actually hits - a port already taken - would
  // print a raw stack and skip the contract.
  it('rejects rather than throw when the port is taken', async () => {
    const occupied = createServer()
    await listen(occupied, 0, '127.0.0.1')
    const port = (occupied.address() as AddressInfo).port
    let thrown: unknown
    try {
      await listen(createServer(), port, '127.0.0.1')
    } catch (err) { thrown = err }
    expect((thrown as NodeJS.ErrnoException | undefined)?.code).toBe('EADDRINUSE')
    await new Promise<void>((resolve) => occupied.close(() => resolve()))
  })

  // MAX_SHEET_ENTRIES protects render memory; the body cap only bounds how much
  // is buffered before admission. One is derived from the other precisely so
  // they cannot disagree - a request the contract accepts that the server then
  // answers 413 is a caller with no way to tell "deck too big" from "malformed".
  // The cap is counted in bytes and the contract in string units, so an ASCII
  // payload proves nothing. This builds the most expensive request the contract
  // will accept, field by field, from the contract's own ceilings: a payload
  // with the sizes hardcoded would keep passing after someone widened a field.
  it('reads the most expensive body the contract accepts', () => {
    const L = SHEET_FIELD_LIMITS
    // A lone surrogate is the worst character a name can carry: it is \p{Cs},
    // so the collapse does not touch it, trim does not remove it, it survives
    // min(1), and JSON.stringify escapes it to a six-byte \uXXXX sequence.
    // A control character is only the second worst - it escapes the same way
    // but the collapse can remove it.
    const wide = '\uD800'.repeat(L.nameInput)
    const worst = {
      locale: 'de' as const, maxBytes: 50_000_000,
      deck: { name: wide, format: 'classic' as const },
      entries: Array.from({ length: MAX_SHEET_ENTRIES }, (_, i) => ({
        cardId: `c${'x'.repeat(L.cardId - 5)}${String(i).padStart(4, '0')}`,
        zone: 'sideboard' as const, quantity: 999, name: wide,
        setCode: 'S'.repeat(L.setCode),
        types: Array.from({ length: L.types }, () => 't'.repeat(L.typeLength)),
        imageVersion: L.imageVersion,
        artCropVersion: L.imageVersion,
        orientation: 'h'.repeat(L.orientation),
      })),
    }
    expect(DeckSheetRequest.safeParse(worst).success).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(worst))).toBeLessThanOrEqual(MAX_BODY_BYTES)
  })
})
