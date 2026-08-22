import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

vi.mock('@/lib/auth-client', () => ({
  signOut: vi.fn(),
}))
vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import { AccountMenu } from '@/components/account-menu'
import type { AccountUser } from '@/components/types'

function renderMenu(isEditor = false, user: AccountUser | null = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AccountMenu isEditor={isEditor} user={user} />
    </NextIntlClientProvider>,
  )
}

describe('AccountMenu', () => {
  it('shows the displayUsername on the trigger and a sign-out item when opened', async () => {
    renderMenu(false, { displayUsername: 'Hermione', username: 'hermione', email: 'h@x.io' })
    const trigger = screen.getByRole('button', { name: /Hermione/ })
    expect(trigger).toBeInTheDocument()
    await userEvent.click(trigger)
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('shows a sign-in link when signed out', () => {
    renderMenu(false, null)
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows an Admin item linking to /admin for an editor', async () => {
    renderMenu(true, { username: 'prof', email: 'p@x.io' })
    await userEvent.click(screen.getByRole('button', { name: /prof/ }))
    const item = await screen.findByText('Admin')
    expect(item.closest('a')).toHaveAttribute('href', '/admin')
  })

  it('omits the Admin item when the user is not an editor', async () => {
    renderMenu(false, { username: 'reader', email: 'r@x.io' })
    await userEvent.click(screen.getByRole('button', { name: /reader/ }))
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })
})
