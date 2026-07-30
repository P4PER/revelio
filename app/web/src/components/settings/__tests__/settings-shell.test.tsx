import { it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import en from '@/../messages/en.json'

// The shell mounts every pane; DangerPane calls the locale-aware router, which
// needs the app router mounted — stub it so the shell can render in isolation.
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

import { SettingsShell } from '../settings-shell'

const user = { id: 'u1', username: 'alice', displayUsername: 'alice', email: 'alice@owl.post', role: 'user', createdAt: '2026-01-01T00:00:00.000Z' }

function renderShell() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <SettingsShell user={user} />
    </NextIntlClientProvider>,
  )
}

it('shows the Profile pane by default', () => {
  renderShell()
  expect(screen.getByRole('heading', { name: en.settings.profile.title })).toBeInTheDocument()
})

it('switches to the Danger zone pane when its nav item is clicked', async () => {
  renderShell()
  await userEvent.click(screen.getByRole('button', { name: en.settings.nav.danger }))
  expect(screen.getByRole('heading', { name: en.settings.danger.title })).toBeInTheDocument()
})
