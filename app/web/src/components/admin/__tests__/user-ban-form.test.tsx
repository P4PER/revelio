import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

const ORIGINAL_TZ = process.env.TZ

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

// Which day is "tomorrow" depends on the hour and the zone, so every test that
// reads the calendar fixes both. Only Date is faked: userEvent needs real timers.
function setClock(iso: string, timeZone: string) {
  process.env.TZ = timeZone
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset())
  h.banUser.mockResolvedValue({ ok: true })
})

afterEach(() => {
  vi.useRealTimers()
  process.env.TZ = ORIGINAL_TZ
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
    setClock('2026-09-16T12:00:00Z', 'Europe/Berlin')
    renderForm(false)
    await userEvent.click(expiryTrigger())
    expect(await screen.findByRole('button', { name: /September 16th/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /September 17th/ })).toBeEnabled()
  })

  // East of UTC just after local midnight the UTC date is still yesterday, so
  // the UTC tomorrow is the local today. Picking it is a valid ban that ends at
  // the next UTC midnight, and banUser accepts it.
  it('offers the local today east of UTC while the UTC date is still yesterday', async () => {
    setClock('2026-09-16T23:16:00Z', 'Europe/Berlin') // 01:16 on Sep 17 in Berlin
    renderForm(false)
    await userEvent.click(expiryTrigger())
    expect(await screen.findByRole('button', { name: /September 16th/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Today, .*September 17th/ })).toBeEnabled()
  })

  // The server reads the picked day as UTC midnight. West of UTC in the evening
  // the local tomorrow has already started in UTC, so it must not be offered.
  it('takes tomorrow from the UTC date, not the local one', async () => {
    setClock('2026-09-17T01:00:00Z', 'America/New_York') // 20:00 on Sep 16 in New York
    renderForm(false)
    await userEvent.click(expiryTrigger())
    expect(await screen.findByRole('button', { name: /September 17th/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /September 18th/ })).toBeEnabled()
  })

  // A ban cannot end in the past, so the year dropdown starts at the year of the
  // earliest expiry instead of the shared picker's 1990. Pinned to 00:30 on
  // New Year's Eve in Berlin: locally tomorrow is already next year, but the
  // UTC tomorrow is still December 31st, so this year stays on offer.
  it('offers expiry years from the earliest expiry up to ten years ahead', async () => {
    setClock('2026-12-30T23:30:00Z', 'Europe/Berlin')
    renderForm(false)
    await userEvent.click(expiryTrigger())
    const years = within(await screen.findByRole('combobox', { name: /year/i }))
      .getAllByRole('option')
      .map((o) => Number(o.textContent))
    expect(years[0]).toBe(2026)
    expect(years.at(-1)).toBe(2036)
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
