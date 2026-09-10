import { it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import en from '@/../messages/en.json'
import { renderWithIntl } from '@/test/intl'

// The pane renders the real DiscordConnection, which reaches for the auth
// client and the unlink action at import time.
vi.mock('@/lib/auth-client', () => ({ authClient: { linkSocial: vi.fn() } }))
vi.mock('@/lib/actions/connections-actions', () => ({ unlinkDiscord: vi.fn() }))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { ConnectionsPane } from '../connections-pane'

const c = en.settings.connections

// The shell owns the section heading and its lead; the providers below it own
// everything else, and discord-connection.test.tsx covers those.
it('titles the section and says what linking is for', () => {
  renderWithIntl(<ConnectionsPane linked={false} configured />)
  expect(screen.getByRole('heading', { name: c.title })).toBeInTheDocument()
  expect(screen.getByText(c.lead)).toBeInTheDocument()
})

it('lists Discord as a provider', () => {
  renderWithIntl(<ConnectionsPane linked={false} configured />)
  expect(screen.getByText(c.discordTitle)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: c.link })).toBeInTheDocument()
})
