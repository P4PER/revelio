import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// The page is a server component using next-intl/server helpers. Mock them to an
// identity translator so we assert on the translation KEYS the page wires up
// (the client form is stubbed, so no NextIntlClientProvider is needed).
vi.mock('next-intl/server', () => ({
  getTranslations: async () => {
    const t = (k: string) => k
    t.rich = (k: string, tags: Record<string, (c: React.ReactNode) => React.ReactNode>) =>
      tags.link ? tags.link(k) : k
    return t
  },
}))
const getCachedSiteSettings = vi.fn(async () => null as unknown)
vi.mock('@/lib/server/site-settings', () => ({ getCachedSiteSettings: () => getCachedSiteSettings() }))
vi.mock('@/components/star-field', () => ({ StarField: () => <div data-testid="star-field" /> }))
const getSession = vi.fn(async () => null as unknown)
vi.mock('@/lib/server/session', () => ({ getSession: () => getSession() }))
vi.mock('@/components/legal/contact-form', () => ({
  ContactForm: ({
    renderedAt,
    defaultName,
    defaultEmail,
    intro,
    footer,
  }: {
    renderedAt: number
    defaultName?: string
    defaultEmail?: string
    intro: React.ReactNode
    footer?: React.ReactNode
  }) => (
    <div data-testid="contact-form" data-name={defaultName} data-email={defaultEmail}>
      {intro}
      <span>{renderedAt}</span>
      {footer}
    </div>
  ),
}))

import ContactPage from '../contact/page'

beforeEach(() => {
  getSession.mockReset()
  getSession.mockResolvedValue(null)
  getCachedSiteSettings.mockReset()
  getCachedSiteSettings.mockResolvedValue(null)
})

describe('ContactPage', () => {
  it('renders the accent title, intro, and the form', async () => {
    const ui = await ContactPage()
    render(ui)

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('titlePrefix')
    expect(heading).toHaveTextContent('titleAccent')
    expect(screen.getByText('intro')).toBeInTheDocument()
    expect(screen.getByTestId('contact-form')).toBeInTheDocument()
  })

  it('passes empty defaults for a signed-out visitor', async () => {
    render(await ContactPage())
    const form = screen.getByTestId('contact-form')
    expect(form).toHaveAttribute('data-name', '')
    expect(form).toHaveAttribute('data-email', '')
  })

  it('prefills name and email from the session for a signed-in user', async () => {
    getSession.mockResolvedValue({
      user: { displayUsername: 'Hermione', username: 'hermione', email: 'hermione@example.com' },
    })
    render(await ContactPage())
    const form = screen.getByTestId('contact-form')
    expect(form).toHaveAttribute('data-name', 'Hermione')
    expect(form).toHaveAttribute('data-email', 'hermione@example.com')
  })

  it('lists the three topics, hidden below lg', async () => {
    render(await ContactPage())
    const list = screen.getByRole('list', { name: 'topicsLabel' })
    expect(list).toHaveClass('hidden', 'lg:flex')
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      'topicCardsTitletopicCardsBody',
      'topicBugsTitletopicBugsBody',
      'topicBotTitletopicBotBody',
    ])
  })

  it('links the configured GitHub project', async () => {
    getCachedSiteSettings.mockResolvedValue({ githubUrl: 'https://github.com/example/revelio' })
    render(await ContactPage())
    const link = screen.getByRole('link', { name: 'github' })
    expect(link).toHaveAttribute('href', 'https://github.com/example/revelio')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('omits the GitHub line entirely when no URL is configured', async () => {
    const { container } = render(await ContactPage())
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.textContent).not.toContain('github')
  })

  it('draws the star field behind the page', async () => {
    render(await ContactPage())
    expect(screen.getByTestId('star-field')).toBeInTheDocument()
  })
})
