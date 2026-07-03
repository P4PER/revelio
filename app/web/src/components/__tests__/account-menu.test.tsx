import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/auth-client', () => ({
  useSession: () => ({ data: { user: { username: 'hermione' } } }),
  signOut: vi.fn(),
}))
vi.mock('@/../i18n/navigation', () => ({ Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a> }))

import { AccountMenu } from '../account-menu'

describe('AccountMenu', () => {
  it('shows the username when signed in', () => {
    render(<AccountMenu signInLabel="Sign in" signOutLabel="Sign out" />)
    expect(screen.getByText('hermione')).toBeInTheDocument()
  })
})
