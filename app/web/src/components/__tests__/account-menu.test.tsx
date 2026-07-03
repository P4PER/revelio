import { render, screen } from '@testing-library/react'
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
  it('shows the username and a sign-out button when signed in', () => {
    mockState.data = { user: { displayUsername: 'Hermione', username: 'hermione' } }
    render(<AccountMenu signInLabel="Sign in" signOutLabel="Sign out" />)
    expect(screen.getByText('Hermione')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('shows a sign-in link when signed out', () => {
    mockState.data = null
    render(<AccountMenu signInLabel="Sign in" signOutLabel="Sign out" />)
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument()
  })
})
