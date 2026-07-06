import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

const { mockState } = vi.hoisted(() => ({ mockState: { data: null as unknown } }))

vi.mock('@/lib/auth-client', () => ({
  useSession: () => mockState,
  signOut: vi.fn(),
}))
vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

import { AccountMenu } from '../account-menu'

function renderMenu(isEditor = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AccountMenu isEditor={isEditor} />
    </NextIntlClientProvider>,
  )
}

describe('AccountMenu', () => {
  it('shows the displayUsername on the trigger and a sign-out item when opened', async () => {
    mockState.data = { user: { displayUsername: 'Hermione', username: 'hermione', email: 'h@x.io' } }
    renderMenu()
    const trigger = screen.getByRole('button', { name: /Hermione/ })
    expect(trigger).toBeInTheDocument()
    await userEvent.click(trigger)
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('shows a sign-in link when signed out', () => {
    mockState.data = null
    renderMenu()
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('shows an Admin item linking to /admin for an editor', async () => {
    mockState.data = { user: { username: 'prof', email: 'p@x.io' } }
    renderMenu(true)
    await userEvent.click(screen.getByRole('button', { name: /prof/ }))
    const item = await screen.findByText('Admin')
    expect(item.closest('a')).toHaveAttribute('href', '/admin')
  })

  it('omits the Admin item when the user is not an editor', async () => {
    mockState.data = { user: { username: 'reader', email: 'r@x.io' } }
    renderMenu(false)
    await userEvent.click(screen.getByRole('button', { name: /reader/ }))
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
    expect(screen.queryByText('Admin')).not.toBeInTheDocument()
  })
})
