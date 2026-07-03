import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, it, expect, vi } from 'vitest'

// HomeSearch (mounted by Home) calls useRouter — stub it out so the test
// doesn't need a full Next.js app-router environment.
vi.mock('@/../i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: (props: { href: string; children: React.ReactNode }) => <a href={props.href}>{props.children}</a>,
}))

import { Home } from '../page'
import de from '@/../messages/de.json'

describe('home page', () => {
  it('renders the German heading under the de locale', () => {
    render(
      <NextIntlClientProvider locale="de" messages={de}>
        <Home />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Kartensuche')
  })
})
