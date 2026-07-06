import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'
import { SubTypeTranslationsForm } from '../subtype-translations-form'

vi.mock('@/lib/sub-type-actions', () => ({ saveSubTypeTranslationsAction: vi.fn(async () => ({ ok: true })) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderForm() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SubTypeTranslationsForm
        locales={['en', 'de']}
        rows={[
          { code: 'death_eater', labels: { de: 'Todesser' } },
          { code: 'wizard', labels: {} },
        ]}
      />
    </NextIntlClientProvider>,
  )
}

describe('SubTypeTranslationsForm', () => {
  it('renders a row per sub-type with existing translations prefilled', () => {
    renderForm()
    expect(screen.getByText('death_eater')).toBeInTheDocument()
    expect(screen.getByText('wizard')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Todesser')).toBeInTheDocument()
  })

  it('saves the full row×locale matrix, sending "" for cleared cells', async () => {
    const { saveSubTypeTranslationsAction } = await import('@/lib/sub-type-actions')
    const { toast } = await import('sonner')
    renderForm()

    fireEvent.change(screen.getByLabelText('death_eater de'), { target: { value: '' } }) // clear -> delete
    fireEvent.change(screen.getByLabelText('wizard en'), { target: { value: 'Wizard' } }) // add
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(saveSubTypeTranslationsAction).toHaveBeenCalled())
    expect(saveSubTypeTranslationsAction).toHaveBeenCalledWith({
      rows: [
        { code: 'death_eater', lang: 'en', label: '' },
        { code: 'death_eater', lang: 'de', label: '' },
        { code: 'wizard', lang: 'en', label: 'Wizard' },
        { code: 'wizard', lang: 'de', label: '' },
      ],
    })
    expect(toast.success).toHaveBeenCalled()
  })
})
