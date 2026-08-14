import { describe, it, expect, vi, beforeEach } from 'vitest'

const getSession = vi.fn()
const redirectMock = vi.fn(() => {
  // The real next-intl redirect throws to halt rendering; mirror that so the
  // test proves requireUser never returns for a signed-out visitor.
  throw new Error('NEXT_REDIRECT')
})

vi.mock('@/lib/session', () => ({ getSession: () => getSession() }))
vi.mock('@/../i18n/navigation', () => ({ redirect: (...a: unknown[]) => redirectMock(...a) }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'de' }))

import { requireUser } from '../require-user'

beforeEach(() => {
  getSession.mockReset()
  redirectMock.mockClear()
})

// `.rejects.toThrow(string)` misbehaves under this vitest/jsdom setup, so catch
// the throw by hand: the point of the assertion is that requireUser never
// returns a value once it has redirected.
async function catchThrow(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run()
  } catch (e) {
    return (e as Error).message
  }
  return undefined
}

describe('requireUser', () => {
  it('returns the user when signed in', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1', email: 'a@b.c' } })
    await expect(requireUser('/settings/profile')).resolves.toMatchObject({ id: 'u1' })
    expect(redirectMock).not.toHaveBeenCalled()
  })

  it('redirects a signed-out visitor to /login carrying the destination', async () => {
    getSession.mockResolvedValue(null)
    expect(await catchThrow(() => requireUser('/settings/profile'))).toBe('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalledWith({
      href: '/login?redirect=%2Fsettings%2Fprofile',
      locale: 'de',
    })
  })

  it('redirects to bare /login when no destination is given', async () => {
    getSession.mockResolvedValue(null)
    expect(await catchThrow(() => requireUser())).toBe('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalledWith({ href: '/login', locale: 'de' })
  })
})
