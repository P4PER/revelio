import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import { ImprintContent } from '../page'

type Props = React.ComponentProps<typeof ImprintContent>

const BASE: Props = {
  operatorName: 'Jane Doe',
  operatorAddress: '1 Main St\n12345 Berlin',
  contactEmail: 'hi@example.com',
  responsiblePerson: null,
}

function renderImprint(locale: 'en' | 'de', messages: typeof en | typeof de, props: Props) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ImprintContent {...props} />
    </NextIntlClientProvider>,
  )
}

describe('ImprintContent', () => {
  it('renders the English title and provider info', () => {
    renderImprint('en', en, BASE)
    expect(screen.getByRole('heading', { level: 1, name: 'Imprint' })).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
    expect(screen.getByText(/hi@example\.com/)).toBeInTheDocument()
  })

  it('renders the German title (Impressum)', () => {
    renderImprint('de', de, BASE)
    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeInTheDocument()
  })

  it('shows the responsible-person section only when set', () => {
    renderImprint('en', en, { ...BASE, responsiblePerson: 'Jane Doe' })
    expect(screen.getByRole('heading', { name: /Responsible for content/i })).toBeInTheDocument()
  })

  it('hides the responsible-person section when null', () => {
    renderImprint('en', en, BASE)
    expect(screen.queryByRole('heading', { name: /Responsible for content/i })).not.toBeInTheDocument()
  })

  it('reuses the footer fan-project disclaimer', () => {
    renderImprint('en', en, BASE)
    expect(screen.getByText(/unofficial, non-commercial fan project/i)).toBeInTheDocument()
  })

  it('falls back to "Not configured" when provider fields are null', () => {
    renderImprint('en', en, {
      operatorName: null,
      operatorAddress: null,
      contactEmail: null,
      responsiblePerson: null,
    })
    expect(screen.getAllByText(/Not configured/).length).toBeGreaterThan(0)
  })
})
