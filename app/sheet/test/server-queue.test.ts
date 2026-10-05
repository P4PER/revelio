import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { DeckSheetRequest } from '@revelio/core'

// The queue's contract is about scheduling, not pixels, so the painter is
// replaced by one a test can hold open. Nothing here draws.
const gate = {
  concurrent: 0,
  peak: 0,
  release: [] as (() => void)[],
  // Ignore the abort signal, like the real painter once it is past its last
  // checkpoint and inside the uninterruptible encode.
  encoding: false,
  reset() { this.concurrent = 0; this.peak = 0; this.release = []; this.encoding = false; completed = 0 },
  openAll() { for (const r of this.release.splice(0)) r() },
}

// Renders that ran all the way to bytes. A render abandoned part-way does not
// count, which is the whole point of the hang-up case.
let completed = 0

vi.mock('../src/render', () => ({
  // Honours opts.signal exactly as the real painter does: it throws at the
  // checkpoint between the fetch phase and the encode, so a caller that goes
  // away mid-render costs the rest of the render rather than all of it.
  renderSheet: vi.fn(async (_req: unknown, opts: { signal?: AbortSignal }) => {
    gate.concurrent += 1
    gate.peak = Math.max(gate.peak, gate.concurrent)
    try {
      await new Promise<void>((resolve, reject) => {
        if (!gate.encoding && opts.signal?.aborted) { reject(opts.signal.reason); return }
        if (!gate.encoding) opts.signal?.addEventListener('abort', () => reject(opts.signal!.reason))
        gate.release.push(resolve)
      })
    } finally {
      gate.concurrent -= 1
    }
    completed += 1
    return {
      body: Buffer.from('png'), contentType: 'image/png' as const,
      pixels: 1, scale: 2, fullArt: true, dropped: 0, distinct: 1, fetchMs: 0, encodeMs: 0,
    }
  }),
}))

const { createSheetServer, MAX_QUEUED, REQUEST_DEADLINE_MS } = await import('../src/server')

const env = { PORT: 0, IMAGE_BASE_URL: 'https://img.test', SHEET_TOKEN: 'a-token-at-least-16-chars' }
const server = createSheetServer(env)
let base = ''

const body: DeckSheetRequest = {
  locale: 'en',
  deck: { name: 'Charms Aggro', format: 'classic' },
  entries: [{
    cardId: 'harry', zone: 'main', quantity: 2, name: 'Harry Potter',
    setCode: 'base', types: ['character'], imageVersion: null, orientation: null,
  }],
}

async function post(init: RequestInit = {}) {
  return fetch(`${base}/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.SHEET_TOKEN}` },
    body: JSON.stringify(body),
    ...init,
  })
}

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

describe('the render queue', () => {
  // Not a nicety: the pod's memory limit is sized for one render, so a queue
  // that lets its waiters through together holds every composite at once.
  it('never has two renders in flight at the same time', async () => {
    gate.reset()
    const flight = Array.from({ length: MAX_QUEUED + 1 }, post)
    // Let every request reach the queue, then drain it one release at a time.
    await vi.waitFor(() => expect(gate.release.length).toBeGreaterThan(0))
    for (let i = 0; i <= MAX_QUEUED; i++) {
      await vi.waitFor(() => expect(gate.release.length).toBe(1))
      gate.openAll()
    }
    const statuses = (await Promise.all(flight)).map((r) => r.status)
    expect(statuses.every((s) => s === 200)).toBe(true)
    expect(gate.peak).toBe(1)
  })

  // Spec section 9. Without this the single render slot is spent painting a
  // sheet into a socket nobody is reading, while every new caller gets a 503.
  it('does not finish a sheet for a caller that hung up', async () => {
    gate.reset()
    const held = post()
    await vi.waitFor(() => expect(gate.release.length).toBe(1))
    // Queued behind the held render, then gone before its turn comes. Whether
    // the server sees the hang-up before this one starts or during it is a
    // race; either way no sheet may be painted all the way to bytes for it.
    const ac = new AbortController()
    const abandoned = post({ signal: ac.signal }).catch(() => 'aborted')
    await new Promise((r) => setTimeout(r, 50))
    ac.abort()
    expect(await abandoned).toBe('aborted')

    gate.openAll()
    expect((await held).status).toBe(200)
    await vi.waitFor(() => expect(gate.concurrent).toBe(0))
    expect(completed).toBe(1)

    // And the abandoned request gave its slot back rather than wedging it.
    gate.reset()
    const after = Array.from({ length: MAX_QUEUED + 1 }, () => post())
    for (let i = 0; i <= MAX_QUEUED; i++) {
      await vi.waitFor(() => expect(gate.release.length).toBe(1))
      gate.openAll()
    }
    expect((await Promise.all(after)).every((r) => r.status === 200)).toBe(true)
    expect(completed).toBe(MAX_QUEUED + 1)
  })

  // A shed request is the clearest sign the service is short of capacity, so it
  // has to show up in the same line as everything else.
  it('logs a shed request', async () => {
    gate.reset()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const flight = Array.from({ length: MAX_QUEUED + 1 }, post)
    await vi.waitFor(() => expect(gate.release.length).toBe(1))
    const shed = await post()
    expect(shed.status).toBe(503)
    expect(log.mock.calls.map((c) => String(c[0])).some((l) => /^sheet: render outcome=shed /.test(l))).toBe(true)
    for (let i = 0; i <= MAX_QUEUED; i++) {
      await vi.waitFor(() => expect(gate.release.length).toBe(1))
      gate.openAll()
    }
    expect((await Promise.all(flight)).every((r) => r.status === 200)).toBe(true)
    log.mockRestore()
  })

  // The encode cannot be interrupted, so a caller that leaves during it still
  // gets a finished render back from the painter. Logging that as `rendered`
  // would hide exactly the abandonment spec section 5 counts.
  it('logs a caller that hung up during the encode as abandoned', async () => {
    gate.reset()
    gate.encoding = true
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const ac = new AbortController()
    const gone = post({ signal: ac.signal }).catch(() => 'aborted')
    await vi.waitFor(() => expect(gate.release.length).toBe(1))
    ac.abort()
    expect(await gone).toBe('aborted')
    await new Promise((r) => setTimeout(r, 50))
    gate.openAll()
    await vi.waitFor(() => expect(completed).toBe(1))
    const lines = await vi.waitFor(() => {
      const found = log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('sheet: render '))
      expect(found).toHaveLength(1)
      return found
    })
    expect(lines[0]).toMatch(/^sheet: render outcome=abandoned /)
    log.mockRestore()
  })

  // The deadline fires the same abort signal as a hang-up, but here the caller is
  // still connected and receives a 500. That is a failure it saw, not an
  // abandonment, and counting it as one would skew the evidence the same way.
  it('logs a render that passed its deadline as failed, not abandoned', async () => {
    gate.reset()
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const res = post()
      await vi.waitFor(() => expect(gate.release.length).toBe(1))
      vi.advanceTimersByTime(REQUEST_DEADLINE_MS)
      expect((await res).status).toBe(500)
    } finally {
      vi.useRealTimers()
    }
    const lines = log.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('sheet: render '))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^sheet: render outcome=failed .*deadline/)
    log.mockRestore()
  })

  it('states a request deadline that bounds one render', () => {
    expect(REQUEST_DEADLINE_MS).toBe(60_000)
  })

  it('sheds the request past one in flight and MAX_QUEUED waiting', async () => {
    gate.reset()
    const flight = Array.from({ length: MAX_QUEUED + 4 }, post)
    await vi.waitFor(() => expect(gate.release.length).toBe(1))
    // Drain everything that was admitted; the rest already answered 503.
    for (let i = 0; i < MAX_QUEUED + 4; i++) {
      if (gate.release.length === 0) break
      gate.openAll()
      await new Promise((r) => setImmediate(r))
    }
    const statuses = (await Promise.all(flight)).map((r) => r.status)
    expect(statuses.filter((s) => s === 200).length).toBe(MAX_QUEUED + 1)
    expect(statuses.filter((s) => s === 503).length).toBe(3)
    expect(gate.peak).toBe(1)
  })
})
