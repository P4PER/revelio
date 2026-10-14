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
      <CommandGrid docsHref={docsHref} />
    </NextIntlClientProvider>,
  )
}

describe('CommandGrid', () => {
  // Tile names are spans; the same commands also appear as <code> chips in the
  // step copy below, so the selector is what keeps this unambiguous.
  it('lists every command the bot registers', () => {
    renderGrid()
    for (const command of BOT_COMMANDS) {
      expect(screen.getByText(`/${command.name}`, { selector: 'span' })).toBeInTheDocument()
    }
  })

  // The grid used to keep its own option list and kept showing /search's
  // removed page option. Structure comes from the manifest now.
  it('shows exactly the options the manifest declares', () => {
    renderGrid()
    for (const command of BOT_COMMANDS) {
      const tile = screen.getByText(`/${command.name}`, { selector: 'span' }).closest('li')!
      const chips = [...tile.querySelectorAll('code')].map((c) => c.textContent)
      expect(chips, command.name).toEqual(command.options.map((o) => o.name))
    }
  })

  it('renders the step copy commands as code chips', () => {
    renderGrid()
    expect(screen.getByText('/collection', { selector: 'code' })).toBeInTheDocument()
    expect(screen.getByText('/mydecks', { selector: 'code' })).toBeInTheDocument()
  })

  // Four of six commands answer privately, so a tag on each stopped telling
  // tiles apart. One line names the exceptions instead: the commands that
  // answer in the channel, which must be exactly the manifest's public ones.
  it('names the commands that answer in the channel, once', () => {
    renderGrid()
    expect(screen.queryByText('Only you see it')).not.toBeInTheDocument()
    const note = screen.getByText(/answer in the channel/)
    const named = [...note.querySelectorAll('code')].map((c) => c.textContent)
    expect(named).toEqual(BOT_COMMANDS.filter((c) => !c.ephemeral).map((c) => `/${c.name}`))
  })

  // Six commands fill two rows of three; the reference tile takes the third
  // row whole instead of sitting in it alone.
  it('lets the reference tile span its row', () => {
    renderGrid('/docs/discord')
    const tile = screen.getByRole('link', { name: /Full reference/i }).closest('li')!
    expect(tile.className).toMatch(/col-span-full/)
  })

  // A chevron ends the tile, after the description, rather than an arrow
  // sitting between the title and the text it leads to.
  it('ends the reference tile with a chevron', () => {
    renderGrid('/docs/discord')
    const link = screen.getByRole('link', { name: /Full reference/i })
    expect(link.lastElementChild?.tagName.toLowerCase()).toBe('svg')
    expect(link.lastElementChild?.getAttribute('class')).toMatch(/lucide-chevron-right/)
    expect(link.querySelectorAll('svg')).toHaveLength(2)
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
