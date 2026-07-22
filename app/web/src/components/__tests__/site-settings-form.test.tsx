import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { SiteSettingsForm } from '../site-settings-form'

const update = vi.fn(async () => ({ ok: true }))
vi.mock('@/lib/site-settings-actions', () => ({
  updateSiteSettings: (...a: unknown[]) => update(...a),
}))
// vi.mock is hoisted above module init, so the toast mock must be too.
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

function renderForm(initial: Parameters<typeof SiteSettingsForm>[0]['initial'] = null) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SiteSettingsForm initial={initial} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  update.mockClear().mockResolvedValue({ ok: true })
  toast.success.mockClear()
  toast.error.mockClear()
})

describe('SiteSettingsForm', () => {
  it('prefills fields from initial settings', () => {
    renderForm({
      id: 'singleton', operatorName: 'Jane Doe', operatorAddress: 'Main St 1',
      contactEmail: 'hi@revelio.cards', hostingProvider: 'Acme', responsiblePerson: null,
      githubUrl: 'https://github.com/x/y', updatedAt: new Date(),
    })
    expect(screen.getByDisplayValue('Jane Doe')).toBeInTheDocument()
    expect(screen.getByDisplayValue('hi@revelio.cards')).toBeInTheDocument()
  })

  it('shows a reactive validation error for a bad email and does not submit', async () => {
    renderForm()
    fireEvent.input(screen.getByLabelText(en.adminSettings.contactEmail), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: en.adminSettings.save }))
    await waitFor(() => expect(screen.getByText(en.validation.email)).toBeInTheDocument())
    expect(update).not.toHaveBeenCalled()
    // reValidateMode: 'onChange' — correcting the field clears the error live.
    fireEvent.input(screen.getByLabelText(en.adminSettings.contactEmail), { target: { value: 'ok@x.com' } })
    await waitFor(() => expect(screen.queryByText(en.validation.email)).toBeNull())
  })

  it('submits valid values through the action and toasts success', async () => {
    renderForm()
    fireEvent.input(screen.getByLabelText(en.adminSettings.operatorName), { target: { value: 'Jane' } })
    fireEvent.click(screen.getByRole('button', { name: en.adminSettings.save }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    expect(update.mock.calls[0][0]).toMatchObject({ operatorName: 'Jane' })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(en.adminSettings.saved))
  })
})
