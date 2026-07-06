import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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
})
