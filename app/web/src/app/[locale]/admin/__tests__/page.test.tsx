import { describe, it, expect, vi, beforeEach } from 'vitest'

const redirect = vi.fn()
const getSession = vi.fn()
const cookieGet = vi.fn()

vi.mock('@/../i18n/navigation', () => ({ redirect: (arg: unknown) => redirect(arg) }))
vi.mock('next-intl/server', () => ({ setRequestLocale: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: cookieGet }) }))
vi.mock('@/lib/session', () => ({ getSession: () => getSession() }))

import AdminIndexPage from '../page'

const run = () => AdminIndexPage({ params: Promise.resolve({ locale: 'en' }) })

beforeEach(() => {
  redirect.mockClear()
  cookieGet.mockReset()
  getSession.mockReset()
})

describe('AdminIndexPage', () => {
  it('redirects to the stored section for an admin', async () => {
    getSession.mockResolvedValue({ user: { role: 'admin' } })
    cookieGet.mockReturnValue({ value: '/admin/users' })
    await run()
    expect(redirect).toHaveBeenCalledWith({ href: '/admin/users', locale: 'en' })
  })

  it('falls back to sub-types when no cookie is set', async () => {
    getSession.mockResolvedValue({ user: { role: 'editor' } })
    cookieGet.mockReturnValue(undefined)
    await run()
    expect(redirect).toHaveBeenCalledWith({ href: '/admin/sub-types', locale: 'en' })
  })

  it('ignores an admin-only stored section for a non-admin', async () => {
    getSession.mockResolvedValue({ user: { role: 'editor' } })
    cookieGet.mockReturnValue({ value: '/admin/users' })
    await run()
    expect(redirect).toHaveBeenCalledWith({ href: '/admin/sub-types', locale: 'en' })
  })
})
