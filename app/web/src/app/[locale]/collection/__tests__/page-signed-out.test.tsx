import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The page is a server component using next-intl/server helpers. Mock them to a
// translator that echoes "<namespace>.<key>", so the assertions pin down both
// the namespace the page reads from and the key it wires up.
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async ({ namespace }: { namespace: string }) =>
    (k: string) => `${namespace}.${k}`,
}))

const getSession = vi.fn()
const loadCollectionPage = vi.fn()

vi.mock('@/lib/server/session', () => ({ getSession: () => getSession() }))
vi.mock('@/lib/server/db', () => ({ getDb: () => ({}) }))
vi.mock('@/lib/server/search-client', () => ({ getSearchClient: () => ({}) }))
vi.mock('@/lib/server/collection-page-data', () => ({
  loadCollectionPage: (...a: unknown[]) => loadCollectionPage(...a),
}))
vi.mock('@revelio/db', () => ({ getCollectionVisibility: vi.fn() }))
vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

import CollectionPage, { generateMetadata } from '../page'

function renderPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  return CollectionPage({
    params: Promise.resolve({ locale: 'en' }),
    searchParams: Promise.resolve(searchParams),
  })
}

beforeEach(() => {
  getSession.mockReset()
  loadCollectionPage.mockReset()
  getSession.mockResolvedValue(null)
})

describe('signed-out /collection', () => {
  it('names the page in the heading, not the teaser pitch', async () => {
    render(await renderPage())
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('collection.title')
  })

  it('puts the teaser pitch below the page heading', async () => {
    render(await renderPage())
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('collection.loggedOut.title')
  })

  it('gives the tab a title and keeps the page out of the index', async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale: 'en' }) })
    expect(meta.title).toBe('collection.title')
    expect(meta.robots).toEqual({ index: false })
  })

  it('offers a sign-in link that comes back here', async () => {
    render(await renderPage())
    expect(screen.getByRole('link', { name: 'collection.loggedOut.signIn' })).toHaveAttribute(
      'href',
      '/login?redirect=%2Fcollection',
    )
  })

  it('returns the visitor to the collection view they linked into', async () => {
    render(await renderPage({ tab: 'browse', set: 'base' }))
    expect(screen.getByRole('link', { name: 'collection.loggedOut.signIn' })).toHaveAttribute(
      'href',
      `/login?redirect=${encodeURIComponent('/collection?tab=browse&set=base')}`,
    )
  })

  it('offers browsing sets as the signed-out alternative', async () => {
    render(await renderPage())
    expect(screen.getByRole('link', { name: 'collection.loggedOut.browseSets' })).toHaveAttribute(
      'href',
      '/sets',
    )
  })

  it('does no collection lookup for a signed-out visitor', async () => {
    await renderPage()
    expect(loadCollectionPage).not.toHaveBeenCalled()
  })
})
