import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'

const { mockState } = vi.hoisted(() => ({ mockState: { data: null as unknown } }))

vi.mock('@/lib/auth-client', () => ({
  useSession: () => mockState,
  signOut: vi.fn(),
}))
vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

import { AccountMenu } from '../account-menu'

describe('AccountMenu', () => {
  it('shows the displayUsername on the trigger and a sign-out item when opened', async () => {
    mockState.data = { user: { displayUsername: 'Hermione', username: 'hermione', email: 'h@x.io' } }
    render(<AccountMenu signInLabel="Sign in" signOutLabel="Sign out" />)
    // trigger shows the original-casing name
    const trigger = screen.getByRole('button', { name: /Hermione/ })
    expect(trigger).toBeInTheDocument()
    // sign-out lives in the menu, revealed on open
    await userEvent.click(trigger)
    expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('shows a sign-in link when signed out', () => {
    mockState.data = null
    render(<AccountMenu signInLabel="Sign in" signOutLabel="Sign out" />)
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })
})
