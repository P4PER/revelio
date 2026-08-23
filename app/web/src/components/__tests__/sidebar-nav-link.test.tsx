import { it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { User } from 'lucide-react'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

import { SidebarNavLink } from '../sidebar-nav-link'

// The gold left rail is the shared active marker; every sidebar depends on it.
const RAIL = 'shadow-[inset_3px_0_0_var(--color-primary)]'

it('marks the active row with aria-current and the gold rail', () => {
  render(<SidebarNavLink href="/a" active>Profile</SidebarNavLink>)
  const link = screen.getByRole('link', { name: 'Profile' })
  expect(link).toHaveAttribute('aria-current', 'page')
  expect(link).toHaveAttribute('data-active', 'true')
  expect(link.className).toContain(RAIL)
})

it('leaves an inactive row unmarked', () => {
  render(<SidebarNavLink href="/a" active={false}>Profile</SidebarNavLink>)
  const link = screen.getByRole('link', { name: 'Profile' })
  expect(link).not.toHaveAttribute('aria-current')
  expect(link.className).not.toContain(RAIL)
})

it('lays out as a flex row and hides the icon from assistive tech', () => {
  render(<SidebarNavLink href="/a" active={false} icon={User}>Profile</SidebarNavLink>)
  const link = screen.getByRole('link', { name: 'Profile' })
  expect(link.className).toContain('flex')
  expect(link.querySelector('svg')).toHaveAttribute('aria-hidden')
})

// Collection rows stack a name row over a progress bar, so no icon means no flex.
it('renders children as a block when no icon is given', () => {
  render(<SidebarNavLink href="/a" active={false} testId="row-a"><span>Base Set</span></SidebarNavLink>)
  const link = screen.getByTestId('row-a')
  expect(link.className).not.toContain('flex')
  expect(link.querySelector('svg')).toBeNull()
})
