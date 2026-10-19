import type { ReactNode } from 'react'
import { render, screen, within } from '@testing-library/react'
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

import { GetStarted } from '@/components/discord/get-started'

const INVITE = 'https://discord.com/oauth2/authorize?client_id=1'

function renderSteps(inviteUrl: string | null = INVITE) {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <GetStarted inviteUrl={inviteUrl} />
    </NextIntlClientProvider>,
  )
}

describe('GetStarted', () => {
  it('renders the three steps in order', () => {
    renderSteps()
    const steps = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(steps.map((s) => within(s).getByRole('heading').textContent)).toEqual([
      'Add the bot',
      'Link your account',
      'Type a slash',
    ])
  })

  it('offers the install button when there is an invite url', () => {
    renderSteps()
    expect(screen.getByRole('link', { name: /Add to Discord/ })).toHaveAttribute('href', INVITE)
  })

  // The invite URL is an admin setting, absent on a fresh database. The step
  // still says what to do; only the button goes.
  it('keeps step one without an invite url', () => {
    renderSteps(null)
    expect(screen.getByText('Add the bot')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Add to Discord/ })).not.toBeInTheDocument()
  })

  it('links the account step to the connections settings', () => {
    renderSteps()
    expect(screen.getByRole('link', { name: /Settings.*Connections/ })).toHaveAttribute(
      'href',
      '/settings/connections',
    )
  })

  // The two step actions sit one above the other; a pill under a rounded
  // rectangle read as two unrelated controls.
  it('rounds the settings link like the install button', () => {
    renderSteps()
    const radius = (el: HTMLElement) => el.className.match(/\brounded-(?:sm|md|lg|xl|full)\b/g)?.at(-1)
    const install = screen.getByRole('link', { name: /Add to Discord/ })
    const settings = screen.getByRole('link', { name: /Settings.*Connections/ })
    expect(radius(install)).toBeDefined()
    expect(radius(settings)).toBe(radius(install))
  })

  it('shows the slash as a key', () => {
    renderSteps()
    expect(screen.getByText('/', { selector: 'kbd' })).toBeInTheDocument()
  })

  it('renders the step commands as code chips', () => {
    renderSteps()
    expect(screen.getByText('/collection', { selector: 'code' })).toBeInTheDocument()
    expect(screen.getByText('/mydecks', { selector: 'code' })).toBeInTheDocument()
  })
})
