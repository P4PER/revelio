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

  it('renders the browse and random CTAs', () => {
    renderAbout('en', en, null)
    expect(screen.getByRole('link', { name: 'Browse sets' })).toHaveAttribute('href', '/sets')
    expect(screen.getByRole('link', { name: 'Random card' })).toHaveAttribute('href', '/random')
  })

  it('lists the tech stack', () => {
    renderAbout('en', en, null)
    expect(screen.getByText('Meilisearch')).toBeInTheDocument()
  })

  it('shows GitHub links pointing at githubUrl when set', () => {
    const url = 'https://github.com/P4PER/revelio'
    renderAbout('en', en, url)
    const links = screen.getAllByRole('link', { name: /GitHub/i })
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) expect(link).toHaveAttribute('href', url)
  })

  it('hides all GitHub links when githubUrl is null', () => {
    renderAbout('en', en, null)
    expect(screen.queryAllByRole('link', { name: /GitHub/i })).toHaveLength(0)
  })
})
