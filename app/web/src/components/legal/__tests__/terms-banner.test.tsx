import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import en from '@/../messages/en.json'
import { TERMS_VERSION } from '@/lib/terms'

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  acceptTermsAction: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  pathname: vi.fn(() => '/'),
}))
vi.mock('@/lib/server/session', () => ({ getSession: h.getSession }))
vi.mock('@/lib/actions/terms-actions', () => ({ acceptTermsAction: h.acceptTermsAction }))
vi.mock('sonner', () => ({ toast: { error: h.toastError } }))
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ refresh: h.refresh }),
  usePathname: () => h.pathname(),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}))

import { TermsBanner } from '../terms-banner'
import { TermsBannerView } from '../terms-banner-view'

function withIntl(node: React.ReactNode) {
  return <NextIntlClientProvider locale="en" messages={en}>{node}</NextIntlClientProvider>
}

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset())
  h.pathname.mockReturnValue('/')
})

describe('TermsBanner', () => {
  it('renders nothing for a visitor who is not signed in', async () => {
    h.getSession.mockResolvedValue(null)
    expect(await TermsBanner()).toBeNull()
  })

  it('renders nothing for an account on the current version', async () => {
    h.getSession.mockResolvedValue({ user: { id: 'u1', termsVersion: TERMS_VERSION } })
    expect(await TermsBanner()).toBeNull()
  })

  it('asks an account that never accepted', async () => {
    h.getSession.mockResolvedValue({ user: { id: 'u1', termsVersion: null } })
    render(withIntl(await TermsBanner()))
    expect(screen.getByRole('region', { name: 'Terms of Service' })).toBeInTheDocument()
  })

  it('asks an account on an older version', async () => {
    h.getSession.mockResolvedValue({ user: { id: 'u1', termsVersion: '2000-01-01' } })
    render(withIntl(await TermsBanner()))
    expect(screen.getByRole('button', { name: 'Accept terms' })).toBeInTheDocument()
  })
})

describe('TermsBannerView', () => {
  // The deck builder sizes its phone shell as the viewport less the header, so
  // a strip above it would push the deck sheet off the bottom of the screen.
  it.each(['/decks/new', '/decks/abc123/edit'])('stays out of the deck builder at %s', (path) => {
    h.pathname.mockReturnValue(path)
    const { container } = render(withIntl(<TermsBannerView />))
    expect(container).toBeEmptyDOMElement()
  })

  it.each(['/decks', '/decks/abc123', '/decks/mine'])('still shows on the other deck pages at %s', (path) => {
    h.pathname.mockReturnValue(path)
    render(withIntl(<TermsBannerView />))
    expect(screen.getByRole('region', { name: 'Terms of Service' })).toBeInTheDocument()
  })

  it('links the terms', () => {
    render(withIntl(<TermsBannerView />))
    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
  })

  // Accepting is the only way to clear it: there is deliberately no dismiss
  // control, since closing a banner is not agreeing to anything.
  it('offers no way to dismiss without accepting', () => {
    render(withIntl(<TermsBannerView />))
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('records acceptance and refreshes so the banner goes away', async () => {
    h.acceptTermsAction.mockResolvedValue({ ok: true })
    render(withIntl(<TermsBannerView />))
    await userEvent.click(screen.getByRole('button', { name: 'Accept terms' }))
    await waitFor(() => expect(h.refresh).toHaveBeenCalled())
    expect(h.acceptTermsAction).toHaveBeenCalledTimes(1)
  })

  it('reports a failed save and stays', async () => {
    h.acceptTermsAction.mockResolvedValue({ ok: false, error: 'unauthorized' })
    render(withIntl(<TermsBannerView />))
    await userEvent.click(screen.getByRole('button', { name: 'Accept terms' }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(en.termsBanner.error))
    expect(h.refresh).not.toHaveBeenCalled()
  })

  it('reports a thrown action the same way', async () => {
    h.acceptTermsAction.mockRejectedValue(new Error('network'))
    render(withIntl(<TermsBannerView />))
    await userEvent.click(screen.getByRole('button', { name: 'Accept terms' }))
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(en.termsBanner.error))
  })
})
