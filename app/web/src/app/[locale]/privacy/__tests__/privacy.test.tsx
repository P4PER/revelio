import { render, screen, cleanup } from '@testing-library/react'
import type { MDXContent } from 'mdx/types'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

// LEGAL_COMPONENTS imports next-intl's navigation Link, which needs the Next
// router that jsdom lacks. A plain anchor keeps what a test would assert: the href.
vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import PrivacyEn from '@/../content/legal/privacy.en.mdx'
import PrivacyDe from '@/../content/legal/privacy.de.mdx'
import { PrivacyContent } from '../page'

type Settings = Omit<React.ComponentProps<typeof PrivacyContent>, 'Document'>

const FULL: Settings = {
  operatorName: 'Jane Doe',
  operatorAddress: '1 Main St\n12345 Berlin',
  contactEmail: 'hi@example.com',
  hostingProvider: 'Hetzner',
}

const LOCALES = {
  en: { messages: en, Document: PrivacyEn as MDXContent },
  de: { messages: de, Document: PrivacyDe as MDXContent },
}

function renderPrivacy(locale: 'en' | 'de', settings: Settings = FULL) {
  const { messages, Document } = LOCALES[locale]
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <PrivacyContent Document={Document} {...settings} />
    </NextIntlClientProvider>,
  )
}

describe('PrivacyContent', () => {
  it('documents moderation data in both locales', () => {
    renderPrivacy('en')
    expect(screen.getByRole('heading', { name: 'Moderation' })).toBeInTheDocument()
    expect(screen.getByText(/Art\. 17 of the Digital Services Act/)).toBeInTheDocument()
    cleanup()
    renderPrivacy('de')
    expect(screen.getByRole('heading', { name: 'Moderation' })).toBeInTheDocument()
    expect(screen.getByText(/Art\. 6 Abs\. 1 lit\. c DSGVO/)).toBeInTheDocument()
  })

  it('discloses the terms acceptance record in both locales', () => {
    renderPrivacy('en')
    expect(screen.getByText(/which version of the terms of service you accepted and when/)).toBeInTheDocument()
    cleanup()
    renderPrivacy('de')
    expect(screen.getByText(/welcher Fassung der Nutzungsbedingungen Sie wann zugestimmt haben/)).toBeInTheDocument()
  })

  it('renders the English title and injects operator values', () => {
    renderPrivacy('en')
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
    expect(screen.getByText(/hi@example\.com/)).toBeInTheDocument()
    expect(screen.getByText(/Hetzner/)).toBeInTheDocument()
  })

  it('states EU-only transfers', () => {
    renderPrivacy('en')
    expect(screen.getByText(/within the European Union/)).toBeInTheDocument()
  })

  it('renders the contact email as a mailto link', () => {
    renderPrivacy('en')
    const link = screen.getByRole('link', { name: 'hi@example.com' })
    expect(link).toHaveAttribute('href', 'mailto:hi@example.com')
  })

  it('presents the Art. 21 right to object as its own section', () => {
    renderPrivacy('en')
    expect(screen.getByRole('heading', { name: /Right to object/i })).toBeInTheDocument()
  })

  it('documents the Discord connection in both locales', () => {
    renderPrivacy('en')
    expect(screen.getByRole('heading', { name: 'Discord connection' })).toBeInTheDocument()
    cleanup()
    renderPrivacy('de')
    expect(screen.getByRole('heading', { name: 'Discord-Verknüpfung' })).toBeInTheDocument()
  })

  // The EU-only transfer claim and the Discord recipient must not contradict
  // each other: naming Discord as a recipient without carving it out of the
  // transfer section would make the policy untrue.
  it('carves Discord out of the EU-only transfer claim', () => {
    renderPrivacy('en')
    expect(screen.getByText(/may process them in the USA/)).toBeInTheDocument()
  })

  it('renders the German title', () => {
    renderPrivacy('de')
    expect(screen.getByRole('heading', { level: 1, name: 'Datenschutzerklärung' })).toBeInTheDocument()
  })

  it('falls back to "Not configured" when operator values are null', () => {
    renderPrivacy('en', {
      operatorName: null,
      operatorAddress: null,
      contactEmail: null,
      hostingProvider: null,
    })
    expect(screen.getAllByText(/Not configured/).length).toBeGreaterThan(0)
  })

  // Markdown only makes a list of lines that start with "- "; a reflowed
  // paragraph must not turn into one, and the rights must not collapse into one.
  it('lists the five data subject rights as list items in both locales', () => {
    renderPrivacy('en')
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    cleanup()
    renderPrivacy('de')
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })

  // The docs component map gives headings and paragraphs their own classes;
  // the privacy policy must be styled by ProseShell alone.
  it('renders headings and paragraphs without the docs styling', () => {
    const { container } = renderPrivacy('en')
    expect(container.querySelector('h2')?.className ?? '').toBe('')
    expect(container.querySelector('p')?.className ?? '').toBe('')
  })

  it('shows the last-updated date', () => {
    renderPrivacy('en')
    expect(screen.getByText(/^Last updated: \w+ \d{1,2}, \d{4}$/)).toBeInTheDocument()
  })
})
