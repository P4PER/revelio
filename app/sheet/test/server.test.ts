  // The cap is counted in bytes and the contract in string units, so an ASCII
  // payload proves nothing. This builds the most expensive request the contract
  // will accept, field by field, rather than a payload that looks expensive.
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
        imageVersion: L.imageVersion, orientation: 'h'.repeat(L.orientation),
      })),
    }
    expect(DeckSheetRequest.safeParse(worst).success).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(worst))).toBeLessThanOrEqual(MAX_BODY_BYTES)
  })

import { describe, it, expect, afterAll, beforeAll } from 'vitest'
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
    // outbound request and still exercise a real render. Phase 4's cache tests
    // override it where a fetch is the point.
    cardId: 'harry', zone: 'main', quantity: 2, name: 'Harry Potter',
    setCode: 'base', types: ['character'], imageVersion: null, orientation: null,
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
  it('reads the largest body the contract accepts', () => {
    // Built from the contract's own ceilings, never from numbers copied out of
    // it: a payload with the sizes hardcoded would keep passing after someone
    // widened a field, which is the exact drift this is here to catch.
    const L = SHEET_FIELD_LIMITS
    const worst = {
      locale: 'de' as const, maxBytes: 50_000_000,
      deck: { name: 'd'.repeat(L.name), format: 'classic' as const },
      entries: Array.from({ length: MAX_SHEET_ENTRIES }, (_, i) => ({
        cardId: `c${'x'.repeat(L.cardId - 5)}${String(i).padStart(4, '0')}`,
        zone: 'sideboard' as const, quantity: 999, name: 'n'.repeat(L.name),
        setCode: 's'.repeat(L.setCode),
        types: Array.from({ length: L.types }, () => 't'.repeat(L.typeLength)),
        imageVersion: 999_999, orientation: 'horizontal',
      })),
    }
    expect(DeckSheetRequest.safeParse(worst).success).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(worst))).toBeLessThanOrEqual(MAX_BODY_BYTES)
  })

  // The cap is counted in bytes and the contract in string units, so an ASCII
  // payload proves nothing about a German one. Every BMP character costs up to
  // three UTF-8 bytes, which is the whole reason the derivation carries a
  // bytes-per-character factor.
  it('reads that body when every painted character is multi-byte', () => {
    const L = SHEET_FIELD_LIMITS
    // U+FFFD is three bytes in UTF-8 and one JS string unit, so it is the worst
    // a name can be without reaching for surrogate pairs (which cost four bytes
    // across two units, and so less per unit).
    // Not U+FFFD (three UTF-8 bytes): a control character is worse, because
    // JSON escapes it to a six-byte \uXXXX sequence, and paintedText collapses
    // rather than rejects it - so a name of text plus control characters is
    // contract-valid and the most expensive thing a body can carry.
    const wide = `${'a'.repeat(L.nameInput / 2)}${'\u0001'.repeat(L.nameInput / 2)}`
    const worst = {
      locale: 'de' as const, maxBytes: 50_000_000,
      deck: { name: wide, format: 'classic' as const },
      entries: Array.from({ length: MAX_SHEET_ENTRIES }, (_, i) => ({
        cardId: `c${'x'.repeat(L.cardId - 5)}${String(i).padStart(4, '0')}`,
        zone: 'sideboard' as const, quantity: 999, name: wide,
        setCode: 'S'.repeat(L.setCode),
        types: Array.from({ length: L.types }, () => 't'.repeat(L.typeLength)),
        imageVersion: 999_999, orientation: 'horizontal',
      })),
    }
    expect(DeckSheetRequest.safeParse(worst).success).toBe(true)
    expect(Buffer.byteLength(JSON.stringify(worst))).toBeLessThanOrEqual(MAX_BODY_BYTES)
  })

  it('sheds load rather than render two sheets at once', async () => {
    // One render in flight, four queued, everything past that is a 503 - which
    // is the same path the callers take when the service is down.
    const flight = Array.from({ length: 12 }, () => post(body))
    const statuses = (await Promise.all(flight)).map((r) => r.status)
    expect(statuses).toContain(200)
    expect(statuses).toContain(503)
  }, 60_000)
})
