import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

const m = vi.hoisted(() => ({
  requestEmailChange: vi.fn(async () => ({ ok: true })),
  confirmEmailChange: vi.fn(async () => ({ ok: true })),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('@/lib/actions/settings-actions', () => ({ requestEmailChange: m.requestEmailChange, confirmEmailChange: m.confirmEmailChange }))
vi.mock('sonner', () => ({ toast: { success: m.toastSuccess, error: m.toastError } }))

import { EmailPane } from '../email-pane'

const user = { id: 'u1', username: 'alice', displayUsername: 'alice', email: 'alice@owl.post', role: 'user', createdAt: '2026-01-01T00:00:00.000Z' }
const renderPane = () => render(
  <NextIntlClientProvider locale="en" messages={en}><EmailPane user={user} /></NextIntlClientProvider>,
)

beforeEach(() => {
  m.requestEmailChange.mockReset().mockResolvedValue({ ok: true })
  m.confirmEmailChange.mockReset().mockResolvedValue({ ok: true })
})

it('reveals the input on Update email, requests a code, then reveals the OTP step', async () => {
  renderPane()
  // Input is hidden until the user opts in.
  expect(screen.queryByLabelText(en.settings.email.newLabel)).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: en.settings.email.updateEmail }))
  await userEvent.type(screen.getByLabelText(en.settings.email.newLabel), 'new@owl.post')
  await userEvent.click(screen.getByRole('button', { name: en.settings.email.sendCode }))
  await waitFor(() => expect(m.requestEmailChange).toHaveBeenCalledWith('new@owl.post'))
  expect(await screen.findByLabelText(en.settings.email.codeLabel)).toBeInTheDocument()
})
