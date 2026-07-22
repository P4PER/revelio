import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}))

import { AboutContent } from '../page'

function renderAbout(locale: 'en' | 'de', messages: typeof en | typeof de, githubUrl: string | null) {
  render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <AboutContent githubUrl={githubUrl} />
    </NextIntlClientProvider>,
  )
}

describe('AboutContent', () => {
  it('renders the English title', () => {
    renderAbout('en', en, null)
    expect(screen.getByRole('heading', { level: 1, name: 'About Revelio' })).toBeInTheDocument()
  })

  it('renders the German title', () => {
    renderAbout('de', de, null)
    expect(screen.getByRole('heading', { level: 1, name: 'Über Revelio' })).toBeInTheDocument()
  })

  it('shows the GitHub link only when githubUrl is set', () => {
    renderAbout('en', en, 'https://github.com/P4PER/revelio')
    const link = screen.getByRole('link', { name: /GitHub/i })
    expect(link).toHaveAttribute('href', 'https://github.com/P4PER/revelio')
  })

  it('hides the GitHub paragraph when githubUrl is null', () => {
    renderAbout('en', en, null)
    expect(screen.queryByRole('link', { name: /GitHub/i })).not.toBeInTheDocument()
  })
})
