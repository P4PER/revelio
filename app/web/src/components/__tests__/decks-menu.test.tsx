import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

import { DecksMenu } from '../decks-menu'

function renderMenu(isLoggedIn = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DecksMenu isLoggedIn={isLoggedIn} />
    </NextIntlClientProvider>,
  )
}

describe('DecksMenu', () => {
  it('links to discover and the deck builder for everyone', async () => {
    renderMenu(false)
    await userEvent.click(screen.getByRole('button', { name: /Decks/ }))
    expect((await screen.findByText('Discover decks')).closest('a')).toHaveAttribute('href', '/decks')
    expect(screen.getByText('Deck Builder').closest('a')).toHaveAttribute('href', '/decks/new')
  })

  it('shows My Decks linking to /decks/mine when signed in', async () => {
    renderMenu(true)
    await userEvent.click(screen.getByRole('button', { name: /Decks/ }))
    const item = await screen.findByText('My Decks')
    expect(item.closest('a')).toHaveAttribute('href', '/decks/mine')
  })

  it('omits My Decks when signed out', async () => {
    renderMenu(false)
    await userEvent.click(screen.getByRole('button', { name: /Decks/ }))
    expect(await screen.findByText('Discover decks')).toBeInTheDocument()
    expect(screen.queryByText('My Decks')).not.toBeInTheDocument()
  })
})
