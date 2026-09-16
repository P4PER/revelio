import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

import { DocsPager } from '@/components/docs/docs-pager'
import type { DocNeighbours } from '@/lib/docs/nav'

function renderPager(
  neighbours: DocNeighbours,
  locale: 'en' | 'de' = 'en',
  messages: typeof en | typeof de = en,
) {
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DocsPager {...neighbours} />
    </NextIntlClientProvider>,
  )
}

describe('DocsPager', () => {
  it('links the previous and next page', () => {
    renderPager({ prev: 'discord', next: 'discord/linking' })
    const nav = screen.getByRole('navigation', { name: 'Previous and next page' })
    expect(within(nav).getByRole('link', { name: 'Previous Overview' })).toHaveAttribute(
      'href',
      '/docs/discord',
    )
    expect(within(nav).getByRole('link', { name: 'Next Account linking' })).toHaveAttribute(
      'href',
      '/docs/discord/linking',
    )
  })

  it('offers only Next on the first page', () => {
    renderPager({ prev: null, next: 'discord/commands' })
    expect(screen.getByRole('link', { name: /^Next/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Previous/ })).toBeNull()
  })

  it('offers only Previous on the last page', () => {
    renderPager({ prev: 'discord/privacy', next: null })
    expect(screen.getByRole('link', { name: /^Previous/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^Next/ })).toBeNull()
  })

  // A labelled nav with nothing in it is still announced as a landmark.
  it('renders nothing when there is no neighbour', () => {
    const { container } = renderPager({ prev: null, next: null })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the German copy', () => {
    renderPager({ prev: 'discord', next: 'discord/linking' }, 'de', de)
    const nav = screen.getByRole('navigation', { name: 'Vorherige und nächste Seite' })
    expect(within(nav).getByRole('link', { name: /^Zurück/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /^Weiter/ })).toBeInTheDocument()
  })
})
