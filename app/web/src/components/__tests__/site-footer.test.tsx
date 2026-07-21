import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { SiteFooterView } from '../site-footer'
import en from '@/../messages/en.json'

// LanguageSwitcher calls next-intl's useRouter, which needs the Next app router
// mounted (unavailable in jsdom). Stub it — it is unrelated to the footer's
// own link/layout behaviour under test.
vi.mock('../language-switcher', () => ({
  LanguageSwitcher: () => <div data-testid="language-switcher" />,
}))

function renderFooter(isLoggedIn = true) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SiteFooterView isLoggedIn={isLoggedIn} />
    </NextIntlClientProvider>,
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('SiteFooter', () => {
  it('shows the unofficial fan project disclaimer', () => {
    renderFooter()
    expect(screen.getByText(/non-commercial fan project/i)).toBeInTheDocument()
    expect(screen.getByText(/Warner Bros\./)).toBeInTheDocument()
  })

  it('renders the three navigation columns with internal links', () => {
    renderFooter()
    const browse = screen.getByRole('navigation', { name: 'Browse' })
    expect(within(browse).getByRole('link', { name: 'Sets' })).toHaveAttribute('href', '/sets')
    expect(within(browse).getByRole('link', { name: 'Discover decks' })).toHaveAttribute('href', '/decks')
    expect(within(browse).getByRole('link', { name: 'Random card' })).toHaveAttribute('href', '/random')

    const build = screen.getByRole('navigation', { name: 'Build' })
    expect(within(build).getByRole('link', { name: 'Deck Builder' })).toHaveAttribute('href', '/decks/new')
    expect(within(build).getByRole('link', { name: 'My Decks' })).toHaveAttribute('href', '/decks/mine')
    expect(within(build).getByRole('link', { name: 'Collection' })).toHaveAttribute('href', '/collection')

    const about = screen.getByRole('navigation', { name: 'About' })
    expect(within(about).getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
    expect(within(about).getByRole('link', { name: 'Contact' })).toHaveAttribute('href', '/contact')
  })

  it('hides personal Build links when logged out but keeps the deck builder', () => {
    renderFooter(false)
    const build = screen.getByRole('navigation', { name: 'Build' })
    expect(within(build).getByRole('link', { name: 'Deck Builder' })).toHaveAttribute('href', '/decks/new')
    expect(within(build).queryByRole('link', { name: 'My Decks' })).not.toBeInTheDocument()
    expect(within(build).queryByRole('link', { name: 'Collection' })).not.toBeInTheDocument()
  })

  it('renders the copyright and back-to-top control', () => {
    renderFooter()
    expect(screen.getByText(/© \d{4} Revelio/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to top' })).toBeInTheDocument()
  })

  it('hides the GitHub link when GITHUB_URL is unset', () => {
    vi.stubEnv('GITHUB_URL', '')
    renderFooter()
    expect(screen.queryByRole('link', { name: /GitHub/ })).not.toBeInTheDocument()
  })

  it('renders an external GitHub link when GITHUB_URL is set', () => {
    vi.stubEnv('GITHUB_URL', 'https://github.com/P4PER/revelio')
    renderFooter()
    const link = screen.getByRole('link', { name: /GitHub/ })
    expect(link).toHaveAttribute('href', 'https://github.com/P4PER/revelio')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
