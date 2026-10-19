import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'
import en from '@/../messages/en.json'

vi.mock('@/../i18n/navigation', () => ({
  Link: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

import { ReferenceTile } from '@/components/discord/reference-tile'

function renderTile() {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ReferenceTile href="/docs/discord" />
    </NextIntlClientProvider>,
  )
}

describe('ReferenceTile', () => {
  it('links to the given docs route', () => {
    renderTile()
    expect(screen.getByRole('link', { name: /Full reference/ })).toHaveAttribute('href', '/docs/discord')
  })

  it('ends with the read-the-reference call to action', () => {
    renderTile()
    const cta = screen.getByRole('link', { name: /Full reference/ }).lastElementChild!
    expect(cta.textContent).toContain('Read the reference')
    expect(cta.querySelector('svg')?.getAttribute('class')).toMatch(/lucide-arrow-right/)
  })

  // The call to action looks like a button but is part of the one link, so the
  // tile costs a keyboard user a single tab stop.
  it('is a single tab stop', () => {
    renderTile()
    const link = screen.getByRole('link', { name: /Full reference/ })
    expect(link.querySelectorAll('a, button')).toHaveLength(0)
  })
})
