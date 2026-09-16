import { render, screen } from '@testing-library/react'
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

import ImprintEn from '@/../content/legal/imprint.en.mdx'
import ImprintDe from '@/../content/legal/imprint.de.mdx'
import { ImprintContent } from '../page'

type Settings = Omit<React.ComponentProps<typeof ImprintContent>, 'Document'>

const BASE: Settings = {
  operatorName: 'Jane Doe',
  operatorAddress: '1 Main St\n12345 Berlin',
  contactEmail: 'hi@example.com',
  responsiblePerson: null,
}

const LOCALES = {
  en: { messages: en, Document: ImprintEn as MDXContent },
  de: { messages: de, Document: ImprintDe as MDXContent },
}

function renderImprint(locale: 'en' | 'de', settings: Settings = BASE) {
  const { messages, Document } = LOCALES[locale]
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <ImprintContent Document={Document} {...settings} />
    </NextIntlClientProvider>,
  )
}

describe('ImprintContent', () => {
  it('renders the English title and provider info', () => {
    renderImprint('en')
    expect(screen.getByRole('heading', { level: 1, name: 'Imprint' })).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
    expect(screen.getByText(/hi@example\.com/)).toBeInTheDocument()
  })

  it('renders the contact email as a mailto link', () => {
    renderImprint('en')
    const link = screen.getByRole('link', { name: 'hi@example.com' })
    expect(link).toHaveAttribute('href', 'mailto:hi@example.com')
  })

  it('renders the German title (Impressum)', () => {
    renderImprint('de')
    expect(screen.getByRole('heading', { level: 1, name: 'Impressum' })).toBeInTheDocument()
  })

  it('shows the responsible-person section only when set', () => {
    renderImprint('en', { ...BASE, responsiblePerson: 'Jane Doe' })
    expect(screen.getByRole('heading', { name: /Responsible for content/i })).toBeInTheDocument()
  })

  it('repeats the operator address under the responsible person', () => {
    renderImprint('en', { ...BASE, responsiblePerson: 'Max Mustermann' })
    expect(screen.getByText(/Max Mustermann/)).toBeInTheDocument()
    // The address shows in both the section 5 provider block and the section 18 block.
    expect(screen.getAllByText(/12345 Berlin/)).toHaveLength(2)
  })

  it('hides the responsible-person section when null', () => {
    renderImprint('en')
    expect(screen.queryByRole('heading', { name: /Responsible for content/i })).not.toBeInTheDocument()
  })

  it('includes the § 36 VSBG consumer dispute-resolution statement', () => {
    renderImprint('en')
    expect(screen.getByRole('heading', { name: /Consumer dispute resolution/i })).toBeInTheDocument()
    expect(screen.getByText(/§ 36 VSBG/)).toBeInTheDocument()
  })

  it('reuses the footer fan-project disclaimer', () => {
    renderImprint('en')
    expect(screen.getByText(/unofficial, non-commercial fan project/i)).toBeInTheDocument()
  })

  it('falls back to "Not configured" when provider fields are null', () => {
    renderImprint('en', {
      operatorName: null,
      operatorAddress: null,
      contactEmail: null,
      responsiblePerson: null,
    })
    expect(screen.getAllByText(/Not configured/).length).toBeGreaterThan(0)
  })

  // The docs component map gives headings and paragraphs their own classes;
  // the imprint must be styled by ProseShell alone.
  it('renders headings without the docs styling', () => {
    const { container } = renderImprint('en')
    expect(container.querySelector('h2')?.className ?? '').toBe('')
  })
})
