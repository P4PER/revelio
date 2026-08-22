import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

const m = vi.hoisted(() => ({
  requestAccountDeletion: vi.fn(async () => ({ ok: true })),
  confirmAccountDeletion: vi.fn(async () => ({ ok: true })),
  signOut: vi.fn(async () => {}),
  push: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@/lib/actions/settings-actions', () => ({ requestAccountDeletion: m.requestAccountDeletion, confirmAccountDeletion: m.confirmAccountDeletion }))
vi.mock('@/lib/auth-client', () => ({ signOut: m.signOut }))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push: m.push, refresh: m.refresh }) }))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

import { DangerPane } from '../danger-pane'

const user = { id: 'u1', username: 'alice', displayUsername: 'alice', email: 'alice@owl.post', role: 'user', createdAt: '2026-01-01T00:00:00.000Z' }
const renderPane = () => render(
  <NextIntlClientProvider locale="en" messages={en}><DangerPane user={user} /></NextIntlClientProvider>,
)

beforeEach(() => {
  m.requestAccountDeletion.mockReset().mockResolvedValue({ ok: true })
  m.confirmAccountDeletion.mockReset().mockResolvedValue({ ok: true })
})

it('requests a deletion code when the dialog opens', async () => {
  renderPane()
  await userEvent.click(screen.getByRole('button', { name: en.settings.danger.deleteAction }))
  await waitFor(() => expect(m.requestAccountDeletion).toHaveBeenCalled())
  expect(await screen.findByText(en.settings.danger.dialogTitle)).toBeInTheDocument()
})
