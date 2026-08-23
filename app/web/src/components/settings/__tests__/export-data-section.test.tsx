import { it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

const emptyExport = { profile: {}, decks: [], collection: { visibility: 'private', ownedCards: [] }, likes: [] }
const m = vi.hoisted(() => ({
  exportMyData: vi.fn(async () => ({ ok: true, data: { profile: {}, decks: [], collection: { visibility: 'private', ownedCards: [] }, likes: [] } })),
  toastError: vi.fn(),
}))
vi.mock('@/lib/actions/settings-actions', () => ({ exportMyData: m.exportMyData }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: m.toastError } }))

import { ExportDataSection } from '../export-data-section'

const user = { id: 'u1', username: 'alice', displayUsername: 'alice', email: 'alice@owl.post', role: 'user', createdAt: '2026-01-01T00:00:00.000Z' }
const renderSection = () => render(
  <NextIntlClientProvider locale="en" messages={en}><ExportDataSection user={user} /></NextIntlClientProvider>,
)

beforeEach(() => {
  m.exportMyData.mockReset().mockResolvedValue({ ok: true, data: emptyExport })
  m.toastError.mockReset()
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:x')
  globalThis.URL.revokeObjectURL = vi.fn()
})

it('calls exportMyData when the button is clicked', async () => {
  renderSection()
  await userEvent.click(screen.getByRole('button', { name: en.settings.safety.export.export }))
  await waitFor(() => expect(m.exportMyData).toHaveBeenCalled())
})

it('toasts an error when export fails', async () => {
  m.exportMyData.mockResolvedValueOnce({ ok: false, error: 'failed' })
  renderSection()
  await userEvent.click(screen.getByRole('button', { name: en.settings.safety.export.export }))
  await waitFor(() => expect(m.toastError).toHaveBeenCalled())
})
