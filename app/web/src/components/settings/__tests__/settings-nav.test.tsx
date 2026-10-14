import { it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

vi.mock('@/../i18n/navigation', () => ({
  usePathname: () => '/settings/email',
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}))

import { SettingsNav } from '../settings-nav'

function renderNav() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SettingsNav />
    </NextIntlClientProvider>,
  )
}

it('marks the current section active from the pathname', () => {
  renderNav()
  expect(screen.getByRole('link', { name: en.settings.nav.email })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: en.settings.nav.profile })).not.toHaveAttribute('aria-current')
})

// Every route behind /settings requires a session, so the nav has no guest variant.
it('links every settings section to its own route', () => {
  renderNav()
  for (const s of ['profile', 'appearance', 'email', 'connections', 'safety'] as const) {
    expect(screen.getByRole('link', { name: en.settings.nav[s] })).toHaveAttribute('href', `/settings/${s}`)
  }
})
