import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { UserBanForm } from '@/components/admin/user-ban-form'

const h = vi.hoisted(() => ({
  banUser: vi.fn(async () => ({ ok: true as const })),
  unbanUser: vi.fn(async () => ({ ok: true as const })),
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('@/lib/actions/user-admin-actions', () => ({ banUser: h.banUser, unbanUser: h.unbanUser }))
vi.mock('sonner', () => ({ toast: { success: h.success, error: h.error } }))

const t = en.admin.users

function renderForm(disabled: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <UserBanForm userId="u2" banned={false} currentReason={null} currentExpires={null} disabled={disabled} />
    </NextIntlClientProvider>,
  )
}

// The expiry field is a DatePicker, so its control is a button labelled by the
// <Label> it is wired to - not a textbox.
const expiryTrigger = () => screen.getByRole('button', { name: t.banExpires })

describe('UserBanForm', () => {
  it('leaves every field usable on another user', () => {
    renderForm(false)
    expect(screen.getByLabelText(t.banReason)).toBeEnabled()
    expect(expiryTrigger()).toBeEnabled()
    expect(screen.getByRole('button', { name: t.banAction })).toBeEnabled()
    expect(screen.queryByText(t.cannotSelf)).not.toBeInTheDocument()
  })

  it('disables the expiry field too on your own account', () => {
    renderForm(true)
    expect(screen.getByLabelText(t.banReason)).toBeDisabled()
    expect(expiryTrigger()).toBeDisabled()
    expect(screen.getByRole('button', { name: t.banAction })).toBeDisabled()
    expect(screen.getByText(t.cannotSelf)).toBeInTheDocument()
  })
})
