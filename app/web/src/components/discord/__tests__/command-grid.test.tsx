import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import { BOT_COMMANDS } from '@revelio/core'
import en from '@/../messages/en.json'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}))

import { CommandGrid } from '@/components/discord/command-grid'

function renderGrid(docsHref?: string | null) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CommandGrid docsHref={docsHref} inviteUrl={null} />
    </NextIntlClientProvider>,
  )
}

describe('CommandGrid', () => {
  it('renders the step copy commands as code chips', () => {
    renderGrid()
    expect(screen.getByText('/collection', { selector: 'code' })).toBeInTheDocument()
    expect(screen.getByText('/mydecks', { selector: 'code' })).toBeInTheDocument()
  })

  // The legend names the exceptions: the commands that answer in the channel,
  // which must be exactly the manifest's public ones. The private rule is its
  // own line beside it.
  it('names the commands that answer in the channel, once', () => {
    renderGrid()
    const note = screen.getByText(/answer in the channel/)
    const named = [...note.querySelectorAll('code')].map((c) => c.textContent)
    expect(named).toEqual(BOT_COMMANDS.filter((c) => !c.ephemeral).map((c) => `/${c.name}`))
    expect(note.textContent).not.toMatch(/Everything else/)
    expect(screen.getByText('Everything else answers only you until you share it.')).toBeInTheDocument()
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
      screen.getByRole('heading', { level: 2, name: 'Type a slash. Pick a command.' }),
    ).toBeInTheDocument()
  })
})
