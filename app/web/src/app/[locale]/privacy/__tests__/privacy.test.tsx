import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import { PrivacyContent } from '../page'

type Props = React.ComponentProps<typeof PrivacyContent>

const FULL: Props = {
  operatorName: 'Jane Doe',
  operatorAddress: '1 Main St\n12345 Berlin',
  contactEmail: 'hi@example.com',
  hostingProvider: 'Hetzner',
}

function renderPrivacy(locale: 'en' | 'de', messages: typeof en | typeof de, props: Props) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <PrivacyContent {...props} />
    </NextIntlClientProvider>,
  )
}

describe('PrivacyContent', () => {
  it('renders the English title and injects operator values', () => {
    renderPrivacy('en', en, FULL)
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
    expect(screen.getByText(/hi@example\.com/)).toBeInTheDocument()
    expect(screen.getByText(/Hetzner/)).toBeInTheDocument()
  })

  it('states EU-only transfers', () => {
    renderPrivacy('en', en, FULL)
    expect(screen.getByText(/within the European Union/)).toBeInTheDocument()
  })

  it('renders the German title', () => {
    renderPrivacy('de', de, FULL)
    expect(screen.getByRole('heading', { level: 1, name: 'Datenschutzerklärung' })).toBeInTheDocument()
  })

  it('falls back to "Not configured" when operator values are null', () => {
    renderPrivacy('en', en, {
      operatorName: null,
      operatorAddress: null,
      contactEmail: null,
      hostingProvider: null,
    })
    expect(screen.getAllByText(/Not configured/).length).toBeGreaterThan(0)
  })
})
