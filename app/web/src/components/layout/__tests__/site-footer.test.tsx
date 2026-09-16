import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { SiteFooterView } from '@/components/layout/site-footer'
import en from '@/../messages/en.json'

// LanguageSwitcher calls next-intl's useRouter, which needs the Next app router
// mounted (unavailable in jsdom). Stub it — it is unrelated to the footer's
// own link/layout behaviour under test.
vi.mock('@/components/layout/language-switcher', () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher" />,
}))

function renderFooter(githubUrl: string | null = null) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SiteFooterView githubUrl={githubUrl} />
    </NextIntlClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('SiteFooter', () => {
  // The bot page has no header-nav link by design, so the footer is its only
  // route in.
  it('links the Discord bot page from the About column', () => {
    renderFooter()
    const about = screen.getByRole('navigation', { name: 'About' })
    expect(within(about).getByRole('link', { name: 'Discord bot' })).toHaveAttribute(
      'href',
      '/discord',
    )
  })

  it('shows the unofficial fan project disclaimer', () => {
    renderFooter()
    expect(screen.getByText(/non-commercial fan project/i)).toBeInTheDocument()
    expect(screen.getByText(/Warner Bros\./)).toBeInTheDocument()
  })

  it('renders the four navigation columns with internal links', () => {
    renderFooter()
    const browse = screen.getByRole('navigation', { name: 'Browse' })
    expect(within(browse).getByRole('link', { name: 'Sets' })).toHaveAttribute('href', '/sets')
    expect(within(browse).getByRole('link', { name: 'Discover decks' })).toHaveAttribute('href', '/decks')
    expect(within(browse).getByRole('link', { name: 'Random card' })).toHaveAttribute('href', '/random')

    // The Build column is the same for every visitor: My Decks and Collection
    // both answer signed out with their own teaser.
    const build = screen.getByRole('navigation', { name: 'Build' })
    expect(within(build).getByRole('link', { name: 'Deck Builder' })).toHaveAttribute('href', '/decks/new')
    expect(within(build).getByRole('link', { name: 'My Decks' })).toHaveAttribute('href', '/decks/mine')
    expect(within(build).getByRole('link', { name: 'Collection' })).toHaveAttribute('href', '/collection')

    const about = screen.getByRole('navigation', { name: 'About' })
    expect(within(about).getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
    expect(within(about).getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact')
  })

  it('renders the copyright and back-to-top control', () => {
    renderFooter()
    expect(screen.getByText(/© \d{4} Revelio/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to top' })).toBeInTheDocument()
  })

  it('renders the legal links', () => {
    renderFooter()
    const legal = screen.getByRole('navigation', { name: 'Legal' })
    expect(within(legal).getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy')
    expect(within(legal).getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
    expect(within(legal).getByRole('link', { name: 'Imprint' })).toHaveAttribute('href', '/imprint')
  })

  it('hides the GitHub link when githubUrl is unset', () => {
    renderFooter(null)
    expect(screen.queryByRole('link', { name: /GitHub/ })).not.toBeInTheDocument()
  })

  it('renders an external GitHub link when githubUrl is set', () => {
    renderFooter('https://github.com/P4PER/revelio')
    const link = screen.getByRole('link', { name: /GitHub/ })
    expect(link).toHaveAttribute('href', 'https://github.com/P4PER/revelio')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // Docs are deliberately absent from the header nav, so this column is the
  // only standing route to them.
  it('links the documentation from its own Reference column', () => {
    renderFooter()
    const reference = screen.getByRole('navigation', { name: 'Reference' })
    expect(within(reference).getByRole('link', { name: 'Documentation' })).toHaveAttribute(
      'href',
      '/docs',
    )
  })

  // GitHub is reference material and moved out of About, which would otherwise
  // leave Reference holding a single link.
  it('carries GitHub in the Reference column, not About', () => {
    renderFooter('https://github.com/P4PER/revelio')
    const reference = screen.getByRole('navigation', { name: 'Reference' })
    expect(within(reference).getByRole('link', { name: /GitHub/ })).toBeInTheDocument()

    const about = screen.getByRole('navigation', { name: 'About' })
    expect(within(about).queryByRole('link', { name: /GitHub/ })).toBeNull()
  })

  it('keeps the Reference column when no repository is configured', () => {
    renderFooter(null)
    const reference = screen.getByRole('navigation', { name: 'Reference' })
    expect(within(reference).getByRole('link', { name: 'Documentation' })).toBeInTheDocument()
    expect(within(reference).queryByRole('link', { name: /GitHub/ })).toBeNull()
  })
})
