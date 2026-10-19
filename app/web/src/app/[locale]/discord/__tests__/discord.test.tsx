import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}))

import { DiscordContent } from '../page'

const INVITE = 'https://discord.com/oauth2/authorize?client_id=1'

function renderPage(
  locale: 'en' | 'de',
  messages: typeof en | typeof de,
  inviteUrl: string | null,
) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DiscordContent inviteUrl={inviteUrl} />
    </NextIntlClientProvider>,
  )
}

describe('DiscordContent', () => {
  it('renders the English headline as the page h1', () => {
    renderPage('en', en, INVITE)
    expect(
      screen.getByRole('heading', { level: 1, name: /Summon any card without leaving the chat/i }),
    ).toBeInTheDocument()
  })

  it('renders the German headline', () => {
    renderPage('de', de, INVITE)
    expect(
      screen.getByRole('heading', { level: 1, name: /Jede Karte beschwören/i }),
    ).toBeInTheDocument()
  })

  // Once in the hero and once as the first step of Get started.
  it('shows the install button in the steps too', () => {
    renderPage('en', en, INVITE)
    const links = screen.getAllByRole('link', { name: /Add to Discord/i })
    expect(links).toHaveLength(2)
    for (const link of links) expect(link).toHaveAttribute('href', INVITE)
  })

  // A fresh database has no invite URL. The page must still be worth serving.
  it('still renders the commands when there is no invite url', () => {
    renderPage('en', en, null)
    expect(screen.queryByRole('link', { name: /Add to Discord/i })).not.toBeInTheDocument()
    // Scoped to the commands landmark: the channel mockup above it also prints
    // "/card", in its "you used /card" context line.
    // Within that, the menu's list: the message box under it types "/card" too.
    const commands = screen.getByRole('region', { name: 'Type a slash. Pick a command.' })
    const menu = within(commands).getByRole('group', { name: "Revelio's commands as Discord lists them" })
    expect(within(menu).getByRole('list')).toHaveTextContent('/card')
    expect(within(menu).getByRole('list')).toHaveTextContent('/mydecks')
  })

  it('shows the channel mockup', () => {
    renderPage('en', en, INVITE)
    // A heading, not bare text: the slash menu's message box below prints the
    // card's name as well.
    expect(screen.getByRole('heading', { level: 3, name: 'Alohomora' })).toBeInTheDocument()
    expect(screen.getByText('View a card...')).toBeInTheDocument()
  })

  it('points the secondary CTA at the commands section', () => {
    renderPage('en', en, INVITE)
    expect(screen.getByRole('link', { name: 'See what it answers' })).toHaveAttribute(
      'href',
      '#commands',
    )
  })

  it('links the reference tile at the docs route', () => {
    renderPage('en', en, INVITE)
    expect(screen.getByRole('link', { name: /Full reference/i })).toHaveAttribute(
      'href',
      '/docs/discord',
    )
  })
})
