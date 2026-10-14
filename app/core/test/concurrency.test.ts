import { describe, it, expect } from 'vitest'
import { mapLimit } from '../src/concurrency.js'

const tick = (ms = 1) => new Promise((resolve) => setTimeout(resolve, ms))

describe('mapLimit', () => {
  it('keeps results in input order, not completion order', async () => {
    const out = await mapLimit([30, 1, 15], 3, async (ms) => { await tick(ms); return ms })
    expect(out).toEqual([30, 1, 15])
  })

  it('never runs more than the limit at once', async () => {
    let inFlight = 0
    let peak = 0
    await mapLimit(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await tick(2)
      inFlight--
    })
    expect(peak).toBe(4)
  })

  // The point of the cap: work not yet started has no timer running, so a
  // per-item timeout measures that item rather than the whole queue.
  it('starts later items only as earlier ones finish', async () => {
    const started: number[] = []
    const startedWhenFirstFinished: number[] = []
    await mapLimit([0, 1, 2, 3], 2, async (i) => {
      started.push(i)
      await tick(i === 0 ? 5 : 20)
      if (i === 0) startedWhenFirstFinished.push(started.length)
    })
    expect(startedWhenFirstFinished).toEqual([2])
    expect(started).toEqual([0, 1, 2, 3])
  })

  it('handles an empty list without hanging', async () => {
    expect(await mapLimit([], 8, async () => 'x')).toEqual([])
  })

  it('rejects if an item rejects', async () => {
    let caught: unknown = null
    try {
      await mapLimit([1, 2], 2, async (n) => { if (n === 2) throw new Error('boom'); return n })
    } catch (err) {
      caught = err
    }
    expect((caught as Error)?.message).toBe('boom')
  })
})
