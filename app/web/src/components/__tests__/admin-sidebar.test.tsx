import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithIntl } from '@/test/intl'

let mockPathname = '/admin/sets'
vi.mock('@/../i18n/navigation', () => ({
  usePathname: () => mockPathname,
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import { AdminSidebar } from '../admin-sidebar'

beforeEach(() => {
  mockPathname = '/admin/sets'
  document.cookie = 'revelio.admin.section=; path=/; max-age=0'
})

describe('AdminSidebar', () => {
  it('shows all sections for admins', () => {
    renderWithIntl(<AdminSidebar isAdmin={true} />)
    expect(screen.getAllByText('Users').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0)
  })

  it('hides admin-only sections for non-admins', () => {
    renderWithIntl(<AdminSidebar isAdmin={false} />)
    expect(screen.queryByText('Users')).toBeNull()
    expect(screen.queryByText('Settings')).toBeNull()
    expect(screen.getAllByText('Sub-types').length).toBeGreaterThan(0)
  })

  it('marks the active section (including nested pages) with aria-current', () => {
    mockPathname = '/admin/sets/new'
    renderWithIntl(<AdminSidebar isAdmin={false} />)
    const current = screen.getAllByRole('link', { current: 'page' })
    expect(current.length).toBeGreaterThan(0)
    current.forEach((el) => expect(el).toHaveAttribute('href', '/admin/sets'))
  })

  it('writes the last-section cookie for the active section', () => {
    mockPathname = '/admin/sub-types'
    renderWithIntl(<AdminSidebar isAdmin={false} />)
    expect(document.cookie).toContain('revelio.admin.section=/admin/sub-types')
  })
})
