import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import type { UserAdminRow } from '@revelio/db'
import { AdminUsersTable } from '../admin-users-table'

vi.mock('@/../i18n/navigation', () => ({
  Link: (p: { href: string; children: React.ReactNode }) => <a href={p.href}>{p.children}</a>,
}))

const users: UserAdminRow[] = [
  { id: 'u1', email: 'ann@x.test', emailVerified: true, image: null, username: 'annadmin', displayUsername: 'AnnAdmin', role: 'admin', banned: false, createdAt: new Date('2024-01-01') },
  { id: 'u2', email: 'ed@x.test', emailVerified: true, image: null, username: 'ededitor', displayUsername: 'EdEditor', role: 'editor', banned: false, createdAt: new Date('2024-02-01') },
  { id: 'u3', email: 'bob@x.test', emailVerified: false, image: null, username: 'bobbanned', displayUsername: 'BobBanned', role: 'user', banned: true, createdAt: new Date('2024-03-01') },
]

function renderTable(rows = users) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AdminUsersTable users={rows} />
    </NextIntlClientProvider>,
  )
}
function rowNames(): string[] {
  return screen.getAllByRole('link').map((a) => a.textContent ?? '')
}

beforeEach(() => vi.clearAllMocks())

describe('AdminUsersTable', () => {
  it('renders a linked row per user, labeled by display username, pointing at its edit page', () => {
    renderTable()
    expect(screen.getByRole('link', { name: 'AnnAdmin' })).toHaveAttribute('href', '/admin/users/u1/edit')
    expect(rowNames()).toHaveLength(3)
  })

  it('searches across email, username, and display username', () => {
    renderTable()
    const search = screen.getByPlaceholderText(en.admin.users.searchPlaceholder)
    fireEvent.change(search, { target: { value: 'ed@x' } }) // email
    expect(rowNames()).toEqual(['EdEditor'])
    fireEvent.change(search, { target: { value: 'bobbanned' } }) // username
    expect(rowNames()).toEqual(['BobBanned'])
    fireEvent.change(search, { target: { value: 'AnnAdmin' } }) // display username (case-insensitive)
    expect(rowNames()).toEqual(['AnnAdmin'])
  })

  it('filters by banned status', () => {
    renderTable()
    fireEvent.click(screen.getByRole('button', { name: en.admin.users.banned }))
    expect(rowNames()).toEqual(['BobBanned'])
  })

  it('hides pagination for a single page', () => {
    renderTable() // 3 users < pageSize 20
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: en.pagination.next })).not.toBeInTheDocument()
  })

  it('shows a record range and pages through when rows exceed the page size', () => {
    const many: UserAdminRow[] = Array.from({ length: 25 }, (_, i) => ({
      id: `p${i}`, email: `p${i}@x.test`, emailVerified: true, image: null,
      username: `user${i}`, displayUsername: `User${i}`, role: 'user', banned: false,
      createdAt: new Date(2024, 0, i + 1),
    }))
    renderTable(many)
    expect(screen.getByText('Showing 1–20 of 25')).toBeInTheDocument()
    expect(rowNames()).toHaveLength(20)
    fireEvent.click(screen.getByRole('button', { name: en.pagination.next }))
    expect(screen.getByText('Showing 21–25 of 25')).toBeInTheDocument()
    expect(rowNames()).toHaveLength(5)
  })
})
