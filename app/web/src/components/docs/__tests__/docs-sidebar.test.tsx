import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

const pathname = vi.fn(() => '/docs/discord/commands')

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
  usePathname: () => pathname(),
}))

import { DocsSidebar } from '@/components/docs/docs-sidebar'

function renderSidebar(locale: 'en' | 'de' = 'en', messages: typeof en | typeof de = en) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DocsSidebar />
    </NextIntlClientProvider>,
  )
}

describe('DocsSidebar', () => {
  it('lists every page in the live section', () => {
    renderSidebar()
    const nav = screen.getByRole('navigation', { name: 'Documentation' })
    for (const name of ['Overview', 'Commands', 'Account linking', 'Privacy and limits', 'Troubleshooting']) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument()
    }
  })

  it('links each page at its own route', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/docs/discord')
    expect(screen.getByRole('link', { name: 'Commands' })).toHaveAttribute(
      'href',
      '/docs/discord/commands',
    )
  })

  // The rail is the reader's position indicator; without this a visitor three
  // pages deep has no idea which one they are on.
  it('marks the page being read, and only that one', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Commands' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current')
  })

  it('marks nothing when the reader is on the hub', () => {
    pathname.mockReturnValueOnce('/docs')
    renderSidebar()
    for (const name of ['Overview', 'Commands']) {
      expect(screen.getByRole('link', { name })).not.toHaveAttribute('aria-current')
    }
  })

  // A planned section advertises what is coming; a link to it would be a dead
  // end, so it must not be one.
  it('shows the planned section as a label, not a link', () => {
    renderSidebar()
    expect(screen.getByText('API')).toBeInTheDocument()
    expect(screen.getByText('Planned')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /API/ })).toBeNull()
  })

  it('renders German titles in German', () => {
    renderSidebar('de', de)
    const nav = screen.getByRole('navigation', { name: 'Dokumentation' })
    expect(within(nav).getByRole('link', { name: 'Überblick' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Befehle' })).toBeInTheDocument()
  })
})
