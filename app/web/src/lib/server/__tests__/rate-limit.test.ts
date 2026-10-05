import { describe, it, expect } from 'vitest'
import { clientIp, consumeContactRateLimit, consumeSheetRateLimit, CONTACT_RATE, SHEET_RATE } from '../rate-limit'

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

describe('consumeSheetRateLimit', () => {
  it('allows a burst and then refuses', async () => {
    const ip = `sheet-test-${Math.random()}`
    for (let i = 0; i < SHEET_RATE.points; i += 1) {
      expect(await consumeSheetRateLimit(ip)).toBe(true)
    }
    expect(await consumeSheetRateLimit(ip)).toBe(false)
  })

  it('budgets each address separately', async () => {
    const a = `sheet-a-${Math.random()}`
    const b = `sheet-b-${Math.random()}`
    for (let i = 0; i < SHEET_RATE.points; i += 1) await consumeSheetRateLimit(a)
    expect(await consumeSheetRateLimit(a)).toBe(false)
    expect(await consumeSheetRateLimit(b)).toBe(true)
  })
})

describe('clientIp', () => {
  it('prefers x-real-ip, which only the proxy can set', () => {
    const h = new Headers({ 'x-real-ip': '10.0.0.9', 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })
    expect(clientIp(h)).toBe('10.0.0.9')
  })

  it('takes the last forwarded hop when there is no x-real-ip', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('10.0.0.1')
  })

  it('shares one bucket for unknown addresses', () => {
    expect(clientIp(new Headers())).toBe('unknown')
  })
})
