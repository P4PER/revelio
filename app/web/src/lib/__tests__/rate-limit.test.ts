import { describe, it, expect } from 'vitest'
import { consumeContactRateLimit, CONTACT_RATE } from '../rate-limit'

describe('consumeContactRateLimit', () => {
  it('allows requests up to the configured point budget, then blocks', async () => {
    // Unique IP per run so the shared in-memory limiter state can't bleed in.
    const ip = `test-${CONTACT_RATE.points}-a`
    for (let i = 0; i < CONTACT_RATE.points; i++) {
      expect(await consumeContactRateLimit(ip)).toBe(true)
    }
    expect(await consumeContactRateLimit(ip)).toBe(false)
  })

  it('tracks budgets independently per IP', async () => {
    const a = 'test-independent-a'
    const b = 'test-independent-b'
    for (let i = 0; i < CONTACT_RATE.points; i++) await consumeContactRateLimit(a)
    // `a` is now exhausted; `b` is untouched and must still be allowed.
    expect(await consumeContactRateLimit(a)).toBe(false)
    expect(await consumeContactRateLimit(b)).toBe(true)
  })
})
