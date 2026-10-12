import { describe, it, expect, vi, beforeEach } from 'vitest'
import LoginPage from '../login/page'
import RegisterPage from '../register/page'

// /login and /register hand redirectIfSignedIn (tested in lib/server) the
// ?redirect= value only after safeRedirectPath has narrowed it, so a signed-in
// visitor can never be sent off-site. Pin that wiring on both pages.

type Page = typeof LoginPage

const redirectIfSignedIn = vi.fn()

// vi.mock is hoisted above the imports, so the pages load against these mocks.
vi.mock('@/lib/server/require-user', () => ({
  redirectIfSignedIn: (to: string | null) => redirectIfSignedIn(to),
}))
vi.mock('@/components/auth/auth-card', () => ({ AuthCard: () => null }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (k: string) => k }))

function renderPage(page: Page, searchParams: Record<string, string | string[] | undefined>) {
  return page({ searchParams: Promise.resolve(searchParams) })
}

beforeEach(() => {
  redirectIfSignedIn.mockReset()
})

describe.each([
  ['/login', LoginPage, 'login'],
  ['/register', RegisterPage, 'register'],
] as const)('%s', (_, page, mode) => {
  it('hands the guard the validated destination', async () => {
    const out = await renderPage(page, { redirect: '/decks/mine' })
    expect(redirectIfSignedIn).toHaveBeenCalledWith('/decks/mine')
    expect(out).toMatchObject({ props: { mode, redirectTo: '/decks/mine' } })
  })

  it('hands the guard nothing for an off-site destination', async () => {
    await renderPage(page, { redirect: '//evil.example' })
    expect(redirectIfSignedIn).toHaveBeenCalledWith(null)
  })
})
