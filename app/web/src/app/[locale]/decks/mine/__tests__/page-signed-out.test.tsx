import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Server component: mock the next-intl/server helpers to a translator that
// echoes "<namespace>.<key>", so assertions pin down namespace and key both.
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async (namespace: string) => (k: string) => `${namespace}.${k}`,
}))

const getSession = vi.fn()
const listDecksByUser = vi.fn()

vi.mock('@/lib/server/session', () => ({ getSession: () => getSession() }))
vi.mock('@/lib/server/db', () => ({ getDb: () => ({}) }))
vi.mock('@revelio/db', () => ({ listDecksByUser: (...a: unknown[]) => listDecksByUser(...a) }))
vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

import DecksPage from '../page'

const renderPage = () => DecksPage({ params: Promise.resolve({ locale: 'en' }) })

beforeEach(() => {
  getSession.mockReset()
  listDecksByUser.mockReset()
  getSession.mockResolvedValue(null)
})

describe('signed-out /decks/mine', () => {
  it('names the page in the heading, not the teaser pitch', async () => {
    render(await renderPage())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('decks.list.title')
  })

  it('puts the teaser pitch below the page heading', async () => {
    render(await renderPage())
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('decks.list.loggedOut.title')
  })

  it('offers a sign-in link that comes back here', async () => {
    render(await renderPage())
    expect(screen.getByRole('link', { name: 'decks.list.loggedOut.signIn' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fdecks%2Fmine',
    )
  })

  it('offers the builder as the signed-out alternative', async () => {
    render(await renderPage())
    expect(screen.getByRole('link', { name: 'decks.list.loggedOut.tryBuilder' })).toHaveAttribute(
      'href',
      '/decks/new',
    )
  })

  it('renders a deck-list ghost behind the teaser, hidden from assistive tech', async () => {
    const { container } = render(await renderPage())
    const ghost = container.querySelector('[aria-hidden="true"]')
    expect(ghost).not.toBeNull()
    expect(ghost!.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0)
  })

  it('does no deck lookup for a signed-out visitor', async () => {
    await renderPage()
    expect(listDecksByUser).not.toHaveBeenCalled()
  })
})
