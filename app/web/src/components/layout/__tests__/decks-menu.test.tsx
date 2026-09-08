import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

import { DecksMenu } from '@/components/layout/decks-menu'

function renderMenu() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DecksMenu />
    </NextIntlClientProvider>,
  )
}

describe('DecksMenu', () => {
  it('links to every deck destination, signed in or out', async () => {
    renderMenu()
    await userEvent.click(screen.getByRole('button', { name: /Decks/ }))
    expect((await screen.findByText('Discover decks')).closest('a')).toHaveAttribute('href', '/decks')
    expect(screen.getByText('Deck Builder').closest('a')).toHaveAttribute('href', '/decks/new')
    // My Decks shows to every visitor. Signed out, /decks/mine renders its own
    // teaser, so the link is a pitch for signing up rather than a dead end.
    expect(screen.getByText('My Decks').closest('a')).toHaveAttribute('href', '/decks/mine')
  })
})
