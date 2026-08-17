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

function renderNav(isLoggedIn = true) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SettingsNav isLoggedIn={isLoggedIn} />
    </NextIntlClientProvider>,
  )
}

it('links each section to its own route', () => {
  renderNav()
  expect(screen.getByRole('link', { name: en.settings.nav.profile })).toHaveAttribute('href', '/settings/profile')
  expect(screen.getByRole('link', { name: en.settings.nav.danger })).toHaveAttribute('href', '/settings/danger')
})

it('marks the current section active from the pathname', () => {
  renderNav()
  expect(screen.getByRole('link', { name: en.settings.nav.email })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: en.settings.nav.profile })).not.toHaveAttribute('aria-current')
})

// Appearance is a device preference, so it is the one section a guest can use;
// the account sections would bounce straight to /login.
it('offers a signed-out visitor only the appearance section', () => {
  renderNav(false)
  expect(screen.getByRole('link', { name: en.settings.nav.appearance })).toHaveAttribute(
    'href',
    '/settings/appearance',
  )
  expect(screen.queryByRole('link', { name: en.settings.nav.profile })).toBeNull()
  expect(screen.queryByRole('link', { name: en.settings.nav.danger })).toBeNull()
})
