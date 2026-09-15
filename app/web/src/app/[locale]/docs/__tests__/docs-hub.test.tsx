import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}))

import { DocsHub } from '../page'

function renderHub(locale: 'en' | 'de' = 'en', messages: typeof en | typeof de = en) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DocsHub />
    </NextIntlClientProvider>,
  )
}

describe('the docs hub', () => {
  it('names itself', () => {
    renderHub()
    expect(screen.getByRole('heading', { level: 1, name: 'Documentation' })).toBeInTheDocument()
  })

  // The hub is the footer link's target, so arriving here must make sense on
  // its own rather than bouncing the visitor somewhere they did not ask for.
  it('links the live section at its first page', () => {
    renderHub()
    expect(screen.getByRole('link', { name: /Discord bot/ })).toHaveAttribute('href', '/docs/discord')
  })

  it('lists what the live section contains', () => {
    renderHub()
    expect(screen.getByText(/Commands/)).toBeInTheDocument()
    expect(screen.getByText(/Troubleshooting/)).toBeInTheDocument()
  })

  it('shows the planned section without linking it anywhere', () => {
    renderHub()
    expect(screen.getByText('API')).toBeInTheDocument()
    expect(screen.getByText('Planned')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /API/ })).toBeNull()
  })

  it('renders in German', () => {
    renderHub('de', de)
    expect(screen.getByRole('heading', { level: 1, name: 'Dokumentation' })).toBeInTheDocument()
    expect(screen.getByText('Geplant')).toBeInTheDocument()
  })
})
