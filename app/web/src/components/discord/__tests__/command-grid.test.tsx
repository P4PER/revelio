import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}))

import { CommandGrid } from '@/components/discord/command-grid'

function renderGrid(docsHref?: string | null) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CommandGrid docsHref={docsHref} />
    </NextIntlClientProvider>,
  )
}

describe('CommandGrid', () => {
  // Tile names are spans; the same commands also appear as <code> chips in the
  // step copy below, so the selector is what keeps this unambiguous.
  it('lists all five commands', () => {
    renderGrid()
    for (const name of ['/card', '/search', '/deck', '/collection', '/mydecks']) {
      expect(screen.getByText(name, { selector: 'span' })).toBeInTheDocument()
    }
  })

  it('renders the step copy commands as code chips', () => {
    renderGrid()
    expect(screen.getByText('/collection', { selector: 'code' })).toBeInTheDocument()
    expect(screen.getByText('/mydecks', { selector: 'code' })).toBeInTheDocument()
  })

  // /collection and /mydecks defer ephemerally in the bot, so the page must not
  // imply their answers are public.
  it('marks exactly the two personal commands as private', () => {
    renderGrid()
    expect(screen.getAllByText('Only you see it')).toHaveLength(2)
  })

  it('hides the reference tile while there is no docs route', () => {
    renderGrid(null)
    expect(screen.queryByRole('link', { name: /Full reference/i })).not.toBeInTheDocument()
  })

  it('links the reference tile once a docs route is given', () => {
    renderGrid('/docs/discord')
    expect(screen.getByRole('link', { name: /Full reference/i })).toHaveAttribute(
      'href',
      '/docs/discord',
    )
  })

  it('renders the three getting-started steps', () => {
    renderGrid()
    expect(screen.getByText('Add the bot')).toBeInTheDocument()
    expect(screen.getByText('Link your account')).toBeInTheDocument()
    expect(screen.getByText('Type a slash')).toBeInTheDocument()
  })

  it('titles the section with an h2, leaving the h1 to the hero', () => {
    renderGrid()
    expect(
      screen.getByRole('heading', { level: 2, name: 'What you can type' }),
    ).toBeInTheDocument()
  })
})
