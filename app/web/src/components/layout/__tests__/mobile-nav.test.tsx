import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import type { AccountUser } from '@/components/layout/types'

vi.mock('@/lib/auth-client', () => ({ signOut: vi.fn() }))
vi.mock('@/../i18n/routing', () => ({ routing: { locales: ['en', 'de'] } }))
vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; onClick?: () => void; children: React.ReactNode }) => (
    <a href={p.href} onClick={p.onClick}>{p.children}</a>
  ),
  usePathname: () => '/search',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

import { MobileNav } from '@/components/layout/mobile-nav'

async function openMenu(isEditor = false, user: AccountUser | null = null) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <MobileNav isEditor={isEditor} user={user} />
    </NextIntlClientProvider>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Menu' }))
}

describe('MobileNav', () => {
  it('opens a drawer with the core destinations', async () => {
    await openMenu()
    expect(await screen.findByRole('link', { name: 'Sets' })).toHaveAttribute('href', '/sets')
    expect(screen.getByRole('link', { name: 'Discover decks' })).toHaveAttribute('href', '/decks')
    expect(screen.getByRole('link', { name: 'Deck Builder' })).toHaveAttribute('href', '/decks/new')
    expect(screen.getByRole('link', { name: 'Random' })).toHaveAttribute('href', '/random')
  })

  it('shows a sign-in link and hides account-only items when signed out', async () => {
    await openMenu(false, null)
    expect(await screen.findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: 'Collection' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'My Decks' })).not.toBeInTheDocument()
    expect(screen.queryByText('Sign out')).not.toBeInTheDocument()
  })

  it('shows account destinations, Admin (for an editor) and sign-out when signed in', async () => {
    await openMenu(true, { email: 'h@x.io', username: 'hermione', displayUsername: 'Hermione' })
    expect(await screen.findByRole('link', { name: 'Collection' })).toHaveAttribute('href', '/collection')
    expect(screen.getByRole('link', { name: 'My Decks' })).toHaveAttribute('href', '/decks/mine')
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/admin')
    expect(screen.getByText('h@x.io')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('omits Admin for a non-editor', async () => {
    await openMenu(false, { email: 'r@x.io', username: 'reader' })
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })
})
