import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { UserBanForm } from '@/components/admin/user-ban-form'

const h = vi.hoisted(() => ({
  banUser: vi.fn(async () => ({ ok: true as const })),
  unbanUser: vi.fn(async () => ({ ok: true as const })),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}))
vi.mock('@/lib/actions/user-admin-actions', () => ({ banUser: h.banUser, unbanUser: h.unbanUser }))
vi.mock('sonner', () => ({ toast: { success: h.success, error: h.error, warning: h.warning } }))

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

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset())
  h.banUser.mockResolvedValue({ ok: true })
})

describe('UserBanForm', () => {
  it('leaves every field usable on another user', async () => {
    renderForm(false)
    expect(screen.getByLabelText(t.banReason)).toBeEnabled()
    expect(expiryTrigger()).toBeEnabled()
    await userEvent.type(screen.getByLabelText(t.banReason), 'spam')
    expect(screen.getByRole('button', { name: t.banAction })).toBeEnabled()
    expect(screen.queryByText(t.cannotSelf)).not.toBeInTheDocument()
  })

  // The reason is emailed to the user as the statement of reasons, so there is
  // nothing to send without one.
  it('keeps Ban disabled until a reason is entered', async () => {
    renderForm(false)
    expect(screen.getByRole('button', { name: t.banAction })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(t.banReason), '   ')
    expect(screen.getByRole('button', { name: t.banAction })).toBeDisabled()
  })

  it('tells the admin the reason goes to the user', () => {
    renderForm(false)
    expect(screen.getByLabelText(t.banReason)).toHaveAccessibleDescription(t.banReasonHint)
  })

  // A ban ending today or earlier is lifted at the next sign-in, and the server
  // rejects it, so the picker does not offer those days.
  it('offers no expiry day before tomorrow', async () => {
    renderForm(false)
    await userEvent.click(expiryTrigger())
    expect(await screen.findByRole('button', { name: /today/i })).toBeDisabled()
  })

  // The server reads the picked day as UTC midnight. West of UTC in the evening
  // the local tomorrow has already started in UTC, so it must not be offered.
  it('takes tomorrow from the UTC date, not the local one', async () => {
    const tz = process.env.TZ
    process.env.TZ = 'America/New_York'
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-17T01:00:00Z')) // 20:00 on Sep 16 in New York
    try {
      renderForm(false)
      await userEvent.click(expiryTrigger())
      expect(await screen.findByRole('button', { name: /September 17th/ })).toBeDisabled()
      expect(screen.getByRole('button', { name: /September 18th/ })).toBeEnabled()
    } finally {
      vi.useRealTimers()
      process.env.TZ = tz
    }
  })

  // A ban cannot end in the past, so the year dropdown starts at the current
  // year instead of the shared picker's 1990.
  it('offers expiry years from now up to ten years ahead', async () => {
    renderForm(false)
    await userEvent.click(expiryTrigger())
    const years = within(await screen.findByRole('combobox', { name: /year/i }))
      .getAllByRole('option')
      .map((o) => Number(o.textContent))
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).getFullYear()
    expect(years[0]).toBe(tomorrow)
    expect(years.at(-1)).toBe(tomorrow + 10)
  })

  async function confirmBan() {
    await userEvent.type(screen.getByLabelText(t.banReason), 'spam')
    await userEvent.click(screen.getByRole('button', { name: t.banAction }))
    await userEvent.click(await screen.findByRole('button', { name: t.banAction }))
  }

  it('warns when the ban stood but the notice was not sent', async () => {
    h.banUser.mockResolvedValue({ ok: true, warning: 'notify-failed' })
    renderForm(false)
    await confirmBan()
    await waitFor(() => expect(h.warning).toHaveBeenCalledWith(t.banNotifyFailed))
    expect(h.success).not.toHaveBeenCalled()
  })

  it('shows the reason-required error from the server', async () => {
    h.banUser.mockResolvedValue({ ok: false, error: 'reason-required' })
    renderForm(false)
    await confirmBan()
    await waitFor(() => expect(h.error).toHaveBeenCalledWith(t.reasonRequiredError))
  })

  it('disables the expiry field too on your own account', () => {
    renderForm(true)
    expect(screen.getByLabelText(t.banReason)).toBeDisabled()
    expect(expiryTrigger()).toBeDisabled()
    expect(screen.getByRole('button', { name: t.banAction })).toBeDisabled()
    expect(screen.getByText(t.cannotSelf)).toBeInTheDocument()
  })
})
