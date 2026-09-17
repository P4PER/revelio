import { render, screen, cleanup } from '@testing-library/react'
import type { MDXContent } from 'mdx/types'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import { FORMATS } from '@/../i18n/formats'

// next-intl's navigation Link needs the Next router, which jsdom lacks. A plain
// anchor keeps what the test asserts: the href.
vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import TermsEn from '@/../content/legal/terms.en.mdx'
import TermsDe from '@/../content/legal/terms.de.mdx'
import { TermsContent } from '../page'
import { TERMS_VERSION } from '@/lib/terms'

type Operator = Omit<React.ComponentProps<typeof TermsContent>, 'Document'>

const FULL: Operator = {
  operatorName: 'Jane Doe',
  operatorAddress: '1 Main St\n12345 Berlin',
  contactEmail: 'hi@example.com',
}

const ANCHORS = [
  'scope', 'service', 'contract', 'account', 'acceptable-use', 'content', 'rights',
  'moderation', 'discord', 'liability', 'termination', 'changes', 'final',
]

// Spelled out rather than formatted with Intl, so the expectation does not
// share the code path under test.
const GERMAN_MONTHS = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]

const LOCALES = {
  en: { messages: en, Document: TermsEn as MDXContent },
  de: { messages: de, Document: TermsDe as MDXContent },
}

function renderTerms(locale: 'en' | 'de', operator: Operator = FULL) {
  const { messages, Document } = LOCALES[locale]
  return render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC" formats={FORMATS}>
      <TermsContent Document={Document} {...operator} />
    </NextIntlClientProvider>,
  )
}

// Section anchors and the "(n)" number of every paragraph, in document order:
// the skeleton both language versions must share.
function outline(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[data-terms-anchor], p')).flatMap((el) => {
    if (el.hasAttribute('data-terms-anchor')) return [`#${el.id}`]
    const number = el.textContent?.match(/^\((\d+)\)/)
    return number ? [number[1]] : []
  })
}

describe('TermsContent', () => {
  it('renders the English title and injects operator values', () => {
    renderTerms('en')
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'hi@example.com' })).toHaveAttribute(
      'href',
      'mailto:hi@example.com',
    )
  })

  it('renders the German title and operator values', () => {
    renderTerms('de')
    expect(screen.getByRole('heading', { level: 1, name: 'Nutzungsbedingungen' })).toBeInTheDocument()
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument()
  })

  it('falls back to "Not configured" when operator values are null', () => {
    renderTerms('en', { operatorName: null, operatorAddress: null, contactEmail: null })
    expect(screen.getAllByText(/Not configured/).length).toBeGreaterThan(0)
  })

  // Registration deep-links #acceptable-use and the ban email cites sections by
  // number, so the anchors are a public contract. rehype-slug ids follow the
  // translated heading, which is exactly why they are not relied on.
  it('puts a language-independent anchor before every section heading', () => {
    for (const locale of ['en', 'de'] as const) {
      const { container } = renderTerms(locale)
      for (const id of ANCHORS) {
        expect(container.querySelector(`#${id}`)?.nextElementSibling?.tagName, `${locale} #${id}`).toBe('H2')
      }
      cleanup()
    }
  })

  // Both versions are declared equally binding (section 13), so a paragraph
  // present in one and missing in the other is a legal defect, not a typo.
  it('gives both languages the same sections and numbered paragraphs', () => {
    const enOutline = outline(renderTerms('en').container)
    cleanup()
    const deOutline = outline(renderTerms('de').container)
    expect(enOutline).toContain('#acceptable-use')
    expect(deOutline).toEqual(enOutline)
  })

  // A liability clause that drops any of these carve-outs is void as a whole
  // under § 309 No. 7 BGB, so the test pins each of them in both languages.
  it('keeps the mandatory carve-outs in the liability clause', () => {
    renderTerms('en')
    expect(screen.getByText(/intent and gross negligence/)).toBeInTheDocument()
    expect(screen.getByText(/injury to\s+life, body or health/)).toBeInTheDocument()
    expect(screen.getByText(/Product Liability Act/)).toBeInTheDocument()
    expect(screen.getByText(/foreseeable and\s+typical/)).toBeInTheDocument()
    cleanup()
    renderTerms('de')
    expect(screen.getByText(/Vorsatz und grober Fahrlässigkeit/)).toBeInTheDocument()
    expect(screen.getByText(/vorhersehbaren,\s+für diese Art von Dienst typischen Schaden/)).toBeInTheDocument()
  })

  // BGH XI ZR 26/20: deemed consent by silence is void, so the change clause
  // must say outright that silence does not count.
  it('does not treat silence as acceptance of a change', () => {
    renderTerms('en')
    expect(screen.getByText(/silence or continued\s+use does not count as acceptance/)).toBeInTheDocument()
  })

  it('keeps the consumer-law caveat on the choice of law', () => {
    renderTerms('en')
    expect(screen.getByText(/habitual\s+residence/)).toBeInTheDocument()
  })

  it('routes internal links through next-intl and opens external ones in a new tab', () => {
    renderTerms('en')
    expect(screen.getByRole('link', { name: 'contact form' })).toHaveAttribute('href', '/contact')
    expect(screen.getAllByRole('link', { name: 'privacy policy' })[0]).toHaveAttribute('href', '/privacy')
    const discordTerms = screen.getByRole('link', { name: 'Terms of Service' })
    expect(discordTerms).toHaveAttribute('href', 'https://discord.com/terms')
    expect(discordTerms).toHaveAttribute('target', '_blank')
    expect(discordTerms).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // The docs component map gives headings and paragraphs their own classes;
  // /terms must look like /privacy and /imprint instead.
  it('renders headings and paragraphs without the docs styling', () => {
    const { container } = renderTerms('en')
    expect(container.querySelector('h2')?.className ?? '').toBe('')
    expect(container.querySelector('p')?.className ?? '').toBe('')
  })

  it('shows the effective date', () => {
    renderTerms('en')
    expect(screen.getByText(/^Effective from \w+ \d{1,2}, \d{4}$/)).toBeInTheDocument()
  })

  // The effective date is UTC midnight; a zone behind UTC must not print it as
  // the day before, or the page would contradict TERMS_VERSION.
  it('keeps the effective day in a zone behind UTC', () => {
    render(
      <NextIntlClientProvider locale="de" messages={de} timeZone="America/Los_Angeles" formats={FORMATS}>
        <TermsContent Document={TermsDe as MDXContent} {...FULL} />
      </NextIntlClientProvider>,
    )
    const [year, month, day] = TERMS_VERSION.split('-').map(Number)
    const expected = `Gültig ab ${day}. ${GERMAN_MONTHS[month - 1]} ${year}`
    expect(screen.getByText(expected)).toBeInTheDocument()
  })
})
