import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'
import { TIME_ZONE } from '@/../i18n/routing'

// legal-mdx imports next-intl's navigation Link, which needs the Next router
// that jsdom lacks. None of these tests renders a link through it.
vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}))

import {
  LastUpdated,
  OperatorAddress,
  OperatorContact,
  OperatorDetails,
  SiteSetting,
  WhenSet,
} from '../legal-mdx'

function renderIn(locale: 'en' | 'de', ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : de} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  )
}

describe('LastUpdated', () => {
  it('formats the date in the reader language as a muted footnote', () => {
    const { container } = renderIn('en', <LastUpdated date="2026-09-16" />)
    const paragraph = container.querySelector('p')
    expect(paragraph?.textContent).toBe('Last updated: September 16, 2026')
    expect(paragraph).toHaveClass('mt-8', 'text-xs', 'text-muted-foreground/70')
  })

  // The date is UTC midnight; the app's zone must not print it as the day before.
  it('keeps the calendar day in the app time zone', () => {
    const { container } = render(
      <NextIntlClientProvider locale="de" messages={de} timeZone={TIME_ZONE}>
        <LastUpdated date="2026-09-16" />
      </NextIntlClientProvider>,
    )
    expect(container.querySelector('p')?.textContent).toBe('Zuletzt aktualisiert: 16. September 2026')
  })
})

describe('OperatorAddress', () => {
  it('puts name and address on separate lines of one paragraph', () => {
    const { container } = renderIn('en', <OperatorAddress name="Jane Doe" address={'1 Main St\n12345 Berlin'} />)
    const paragraph = container.querySelector('p')
    expect(paragraph).toHaveClass('whitespace-pre-line')
    expect(paragraph?.textContent).toBe('Jane Doe\n1 Main St\n12345 Berlin')
  })

  it('falls back per field in the reader language', () => {
    const { container } = renderIn('de', <OperatorAddress name={null} address={null} />)
    expect(container.querySelector('p')?.textContent).toBe('Nicht konfiguriert\nNicht konfiguriert')
  })
})

describe('OperatorContact', () => {
  it('labels the email and links it', () => {
    const { container, getByRole } = renderIn('de', <OperatorContact email="hi@example.com" />)
    expect(container.querySelector('p')?.textContent).toBe('E-Mail: hi@example.com')
    expect(getByRole('link', { name: 'hi@example.com' })).toHaveAttribute('href', 'mailto:hi@example.com')
  })

  it('falls back without a link when no email is set', () => {
    const { container, queryByRole } = renderIn('en', <OperatorContact email={null} />)
    expect(container.querySelector('p')?.textContent).toBe('Email: Not configured')
    expect(queryByRole('link')).toBeNull()
  })
})

describe('OperatorDetails', () => {
  it('renders the address paragraph followed by the contact paragraph', () => {
    const { container } = renderIn('en', <OperatorDetails name="Jane Doe" address="Berlin" email="hi@example.com" />)
    const paragraphs = Array.from(container.querySelectorAll('p')).map((p) => p.textContent)
    expect(paragraphs).toEqual(['Jane Doe\nBerlin', 'Email: hi@example.com'])
  })
})

describe('SiteSetting', () => {
  it('renders the value inline', () => {
    const { container } = renderIn('en', <p>Host: <SiteSetting value="Hetzner" /></p>)
    expect(container.querySelector('p')?.textContent).toBe('Host: Hetzner')
  })

  it('falls back when the value is not set', () => {
    const { container } = renderIn('en', <p>Host: <SiteSetting value={null} /></p>)
    expect(container.querySelector('p')?.textContent).toBe('Host: Not configured')
  })
})

describe('WhenSet', () => {
  it('renders its children when the value is set', () => {
    const { container } = renderIn('en', <WhenSet value="Jane Doe"><h2>Responsible</h2></WhenSet>)
    expect(container.querySelector('h2')).not.toBeNull()
  })

  // The imprint used `responsiblePerson && ...`, so an empty string hid the
  // section too. Keep that.
  it.each([null, ''])('renders nothing for %j', (value) => {
    const { container } = renderIn('en', <WhenSet value={value}><h2>Responsible</h2></WhenSet>)
    expect(container).toBeEmptyDOMElement()
  })
})
