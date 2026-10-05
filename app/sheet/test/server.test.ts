import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import type { AddressInfo } from 'node:net'
import sharp from 'sharp'
import type { DeckSheetRequest } from '@revelio/core'
import { createServer } from 'node:http'
import { createSheetServer, listen } from '../src/server'

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
    const huge = { ...body, deck: { ...body.deck, name: 'x'.repeat(300_000) } }
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

  it('sheds load rather than render two sheets at once', async () => {
    // One render in flight, four queued, everything past that is a 503 - which
    // is the same path the callers take when the service is down.
    const flight = Array.from({ length: 12 }, () => post(body))
    const statuses = (await Promise.all(flight)).map((r) => r.status)
    expect(statuses).toContain(200)
    expect(statuses).toContain(503)
  }, 60_000)
})
