import { describe, it, expect, afterAll, beforeAll, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { DeckSheetRequest } from '@revelio/core'

// The queue's contract is about scheduling, not pixels, so the painter is
// replaced by one a test can hold open. Nothing here draws.
const gate = {
  concurrent: 0,
  peak: 0,
  release: [] as (() => void)[],
  reset() { this.concurrent = 0; this.peak = 0; this.release = [] },
  openAll() { for (const r of this.release.splice(0)) r() },
}

vi.mock('../src/render', () => ({
  renderSheet: vi.fn(async () => {
    gate.concurrent += 1
    gate.peak = Math.max(gate.peak, gate.concurrent)
    await new Promise<void>((resolve) => gate.release.push(resolve))
    gate.concurrent -= 1
    return {
      body: Buffer.from('png'), contentType: 'image/png' as const,
      pixels: 1, scale: 2, fullArt: true, dropped: 0, distinct: 1,
    }
  }),
}))

const { createSheetServer, MAX_QUEUED } = await import('../src/server')

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

async function post() {
  return fetch(`${base}/render`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${env.SHEET_TOKEN}` },
    body: JSON.stringify(body),
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
