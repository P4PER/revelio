import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  // The rail is a map, and a map that cannot be folded gets long as sections
  // are added. The section holding the page being read is the one that must
  // never start folded.
  it('opens the section holding the page being read', () => {
    renderSidebar()
    expect(screen.getByRole('button', { name: /Discord bot/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('hides a section\'s pages once it is collapsed', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByRole('button', { name: /Discord bot/ }))
    expect(screen.getByRole('button', { name: /Discord bot/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByRole('link', { name: 'Commands' })).toBeNull()
  })

  // aria-controls has to point at an element that exists. Unmounting the list
  // on collapse leaves the IDREF dangling, so AT following it finds nothing.
  it('keeps the panel aria-controls names in the DOM while collapsed', async () => {
    const user = userEvent.setup()
    renderSidebar()
    const toggle = screen.getByRole('button', { name: /Discord bot/ })
    await user.click(toggle)
    const panelId = toggle.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    expect(document.getElementById(panelId as string)).not.toBeNull()
  })

  // Nothing to expand into, so it must not offer a control that does nothing.
  it('leaves the planned section as a plain label, not a disclosure', () => {
    renderSidebar()
    expect(screen.queryByRole('button', { name: /API/ })).toBeNull()
  })

  it('renders German titles in German', () => {
    renderSidebar('de', de)
    const nav = screen.getByRole('navigation', { name: 'Dokumentation' })
    expect(within(nav).getByRole('link', { name: 'Überblick' })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Befehle' })).toBeInTheDocument()
  })
})
