import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TERMS_VERSION } from '@/lib/terms'

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  recordTermsAcceptance: vi.fn(async () => {}),
}))
vi.mock('@/lib/server/session', () => ({ getSession: m.getSession }))
vi.mock('@/lib/server/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({ recordTermsAcceptance: m.recordTermsAcceptance }))

import { acceptTermsAction } from '../terms-actions'

beforeEach(() => {
  m.getSession.mockReset()
  m.recordTermsAcceptance.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-20T12:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('acceptTermsAction', () => {
  it('refuses without a session and writes nothing', async () => {
    m.getSession.mockResolvedValue(null)
    expect(await acceptTermsAction()).toEqual({ ok: false, error: 'unauthorized' })
    expect(m.recordTermsAcceptance).not.toHaveBeenCalled()
  })

  // The record is only evidence if nothing about it comes from the client:
  // who from the session, which version from the constant, when from the
  // server clock.
  it('records the session user, the current version and the server time', async () => {
    m.getSession.mockResolvedValue({ user: { id: 'u1' } })
    expect(await acceptTermsAction()).toEqual({ ok: true })
    expect(m.recordTermsAcceptance).toHaveBeenCalledWith(
      expect.anything(),
      'u1',
      TERMS_VERSION,
      new Date('2026-09-20T12:00:00Z'),
    )
  })

  it('ignores anything a caller passes', async () => {
    m.getSession.mockResolvedValue({ user: { id: 'u1' } })
    const call = acceptTermsAction as unknown as (...a: unknown[]) => Promise<unknown>
    await call({ userId: 'someone-else', version: '2099-01-01' })
    expect(m.recordTermsAcceptance).toHaveBeenCalledWith(expect.anything(), 'u1', TERMS_VERSION, expect.any(Date))
  })
})
