import { describe, it, expect, vi, beforeEach } from 'vitest'

// /login and /register are server components. A signed-in visitor has no use
// for either form, so both pages send them on to the validated ?redirect=
// target, or home. next-intl's redirect throws to end the render, and the mock
// does the same so nothing after it runs.

const getSession = vi.fn()
const redirect = vi.fn((_: { href: string; locale: string }) => {
  throw new Error('NEXT_REDIRECT')
})

vi.mock('@/lib/server/session', () => ({ getSession: () => getSession() }))
vi.mock('@/../i18n/navigation', () => ({
  redirect: (a: { href: string; locale: string }) => redirect(a),
}))
vi.mock('@/components/auth/auth-card', () => ({ AuthCard: () => null }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }))

import LoginPage from '../login/page'
import RegisterPage from '../register/page'

type Page = typeof LoginPage

async function renderPage(page: Page, searchParams: Record<string, string | string[] | undefined>, locale = 'en') {
  try {
    return await page({ params: Promise.resolve({ locale }), searchParams: Promise.resolve(searchParams) })
  } catch (e) {
    if (e instanceof Error && e.message === 'NEXT_REDIRECT') return 'redirected'
    throw e
  }
}

beforeEach(() => {
  getSession.mockReset()
  redirect.mockClear()
})

describe.each([
  ['/login', LoginPage, 'login'],
  ['/register', RegisterPage, 'register'],
] as const)('%s', (_, page, mode) => {
  it('sends a signed-in visitor to the redirect target', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } })
    expect(await renderPage(page, { redirect: '/collection?set=bs' }, 'de')).toBe('redirected')
    expect(redirect).toHaveBeenCalledWith({ href: '/collection?set=bs', locale: 'de' })
  })

  it('sends a signed-in visitor home when there is no redirect target', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } })
    expect(await renderPage(page, {})).toBe('redirected')
    expect(redirect).toHaveBeenCalledWith({ href: '/', locale: 'en' })
  })

  it('sends a signed-in visitor home rather than off-site', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1' } })
    expect(await renderPage(page, { redirect: '//evil.example' })).toBe('redirected')
    expect(redirect).toHaveBeenCalledWith({ href: '/', locale: 'en' })
  })

  it('shows a signed-out visitor the form', async () => {
    getSession.mockResolvedValue(null)
    const out = await renderPage(page, { redirect: '/decks/mine' })
    expect(redirect).not.toHaveBeenCalled()
    expect(out).toMatchObject({ props: { mode, redirectTo: '/decks/mine' } })
  })
})
