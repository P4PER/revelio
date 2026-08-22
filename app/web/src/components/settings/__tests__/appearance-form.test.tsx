import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import messages from '@/../messages/en.json'
import { AppearanceForm } from '@/components/settings/appearance-form'

const setTheme = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/actions/theme-actions', () => ({ setTheme: (c: unknown) => setTheme(c) }))

function renderForm(current: 'system' | 'light' | 'dark' = 'system') {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AppearanceForm current={current} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  setTheme.mockClear()
  delete document.documentElement.dataset.theme
})

describe('AppearanceForm', () => {
  it('marks the current choice as selected', () => {
    renderForm('dark')
    expect(screen.getByRole('radio', { name: /dark/i })).toBeChecked()
  })

  it('persists the choice and mirrors it onto <html> straight away', async () => {
    renderForm('system')
    await userEvent.click(screen.getByRole('radio', { name: /light/i }))
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(setTheme).toHaveBeenCalledWith('light')
  })

  it('removes the attribute for system, so the media query takes over', async () => {
    renderForm('dark')
    await userEvent.click(screen.getByRole('radio', { name: /system/i }))
    expect(document.documentElement.dataset.theme).toBeUndefined()
    expect(setTheme).toHaveBeenCalledWith('system')
  })

  // The other four settings panes each expose a named region; this one did not.
  it('exposes the pane as a named region, like its sibling panes', () => {
    renderForm('system')
    expect(screen.getByRole('region', { name: 'Appearance' })).toBeInTheDocument()
  })

  // The miniature is decoration. If it ever leaked into the accessible name,
  // screen-reader users would hear the markup instead of the choice.
  it('keeps each radio named by its option and hint alone', () => {
    renderForm('system')
    expect(screen.getByRole('radio', { name: 'Dark Midnight and gold' })).toBeInTheDocument()
  })
})
