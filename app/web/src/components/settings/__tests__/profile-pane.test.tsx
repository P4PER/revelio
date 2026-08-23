import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

const m = vi.hoisted(() => ({
  updateUsername: vi.fn(async () => ({ ok: true })),
  usernameAvailable: vi.fn(async () => true),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@/lib/actions/settings-actions', () => ({ updateUsername: m.updateUsername }))
vi.mock('@/lib/actions/auth-actions', () => ({ usernameAvailable: m.usernameAvailable }))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

import { ProfilePane } from '../profile-pane'

const user = { id: 'u1', username: 'alice', displayUsername: 'alice', email: 'alice@owl.post', role: 'user', createdAt: '2026-01-01T00:00:00.000Z' }
const renderPane = () => render(
  <NextIntlClientProvider locale="en" messages={en}><ProfilePane user={user} /></NextIntlClientProvider>,
)

beforeEach(() => {
  m.updateUsername.mockReset().mockResolvedValue({ ok: true })
  m.usernameAvailable.mockReset().mockResolvedValue(true)
  m.toastSuccess.mockReset()
  m.toastError.mockReset()
})

it('saves a changed username and toasts success', async () => {
  renderPane()
  const input = screen.getByLabelText(en.settings.profile.usernameLabel)
  await userEvent.clear(input)
  await userEvent.type(input, 'bob')
  await userEvent.click(screen.getByRole('button', { name: en.settings.profile.save }))
  await waitFor(() => expect(m.updateUsername).toHaveBeenCalledWith('bob'))
  await waitFor(() => expect(m.toastSuccess).toHaveBeenCalled())
})

it('describes the username input with the preview, and keeps a generic pane lead', () => {
  renderPane()
  const input = screen.getByLabelText(en.settings.profile.usernameLabel)
  const preview = screen.getByText(/@alice on your decks/)
  expect(input.getAttribute('aria-describedby')?.split(' ')).toContain(preview.id)
  expect(screen.getByText(en.settings.profile.lead)).toBeInTheDocument()
})

it('previews the public identity live and hides it when the field is empty', async () => {
  renderPane()
  const input = screen.getByLabelText(en.settings.profile.usernameLabel)
  expect(screen.getByText(/@alice on your decks/)).toHaveTextContent('/collection/alice')

  await userEvent.clear(input)
  expect(screen.queryByText(/on your decks/)).toBeNull()

  await userEvent.type(input, 'bob')
  expect(screen.getByText(/@bob on your decks/)).toHaveTextContent('/collection/bob')
})
