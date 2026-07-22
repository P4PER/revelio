import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// The page is a server component using next-intl/server helpers. Mock them to an
// identity translator so we assert on the translation KEYS the page wires up
// (the client form is stubbed, so no NextIntlClientProvider is needed).
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (k: string) => k,
}))
vi.mock('@/components/contact-form', () => ({
  ContactForm: ({ renderedAt }: { renderedAt: number }) => (
    <div data-testid="contact-form">{renderedAt}</div>
  ),
}))

import ContactPage from '../contact/page'

describe('ContactPage', () => {
  it('renders the eyebrow, accent title, intro, and the form', async () => {
    const ui = await ContactPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)

    expect(screen.getByText('eyebrow')).toBeInTheDocument()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('titlePrefix')
    expect(heading).toHaveTextContent('titleAccent')
    expect(screen.getByText('intro')).toBeInTheDocument()
    expect(screen.getByTestId('contact-form')).toBeInTheDocument()
  })
})
