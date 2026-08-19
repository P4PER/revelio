import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import messages from '../../../messages/en.json'
import { AppearanceForm } from '@/components/settings/appearance-form'

const setTheme = vi.fn(async () => ({ ok: true as const }))
vi.mock('@/lib/theme-actions', () => ({ setTheme: (c: unknown) => setTheme(c) }))

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
})
