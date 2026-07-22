import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The page is a server component using next-intl/server helpers. Mock them to an
// identity translator so we assert on the translation KEYS the page wires up
// (the client form is stubbed, so no NextIntlClientProvider is needed).
vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (k: string) => k,
}))
const getSession = vi.fn(async () => null as unknown)
vi.mock('@/lib/session', () => ({ getSession: () => getSession() }))
vi.mock('@/components/contact-form', () => ({
  ContactForm: ({
    renderedAt,
    defaultName,
    defaultEmail,
  }: {
    renderedAt: number
    defaultName?: string
    defaultEmail?: string
  }) => (
    <div data-testid="contact-form" data-name={defaultName} data-email={defaultEmail}>
      {renderedAt}
    </div>
  ),
}))

import ContactPage from '../contact/page'

beforeEach(() => {
  getSession.mockReset()
  getSession.mockResolvedValue(null)
})

describe('ContactPage', () => {
  it('renders the accent title, intro, and the form', async () => {
    const ui = await ContactPage({ params: Promise.resolve({ locale: 'en' }) })
    render(ui)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('titlePrefix')
    expect(heading).toHaveTextContent('titleAccent')
    expect(screen.getByText('intro')).toBeInTheDocument()
    expect(screen.getByTestId('contact-form')).toBeInTheDocument()
  })

  it('passes empty defaults for a signed-out visitor', async () => {
    render(await ContactPage({ params: Promise.resolve({ locale: 'en' }) }))
    const form = screen.getByTestId('contact-form')
    expect(form).toHaveAttribute('data-name', '')
    expect(form).toHaveAttribute('data-email', '')
  })

  it('prefills name and email from the session for a signed-in user', async () => {
    getSession.mockResolvedValue({
      user: { displayUsername: 'Hermione', username: 'hermione', email: 'hermione@example.com' },
    })
    render(await ContactPage({ params: Promise.resolve({ locale: 'en' }) }))
    const form = screen.getByTestId('contact-form')
    expect(form).toHaveAttribute('data-name', 'Hermione')
    expect(form).toHaveAttribute('data-email', 'hermione@example.com')
  })
})
