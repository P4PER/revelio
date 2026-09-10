import { it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import en from '@/../messages/en.json'
import { renderWithIntl } from '@/test/intl'

const m = vi.hoisted(() => ({
  linkSocial: vi.fn(async () => ({ data: { url: 'https://discord.test/oauth' }, error: null })),
  unlinkAccount: vi.fn(async () => ({ data: { status: true }, error: null })),
  refresh: vi.fn(),
}))
vi.mock('@/lib/auth-client', () => ({
  authClient: { linkSocial: m.linkSocial, unlinkAccount: m.unlinkAccount },
}))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }))

import { ConnectionsPane } from '../connections-pane'

const c = en.settings.connections

beforeEach(() => {
  m.linkSocial.mockReset().mockResolvedValue({ data: { url: 'https://discord.test/oauth' }, error: null })
  m.unlinkAccount.mockReset().mockResolvedValue({ data: { status: true }, error: null })
  m.refresh.mockReset()
})

it('offers to link when Discord is not connected', () => {
  renderWithIntl(<ConnectionsPane linked={false} configured />)
  expect(screen.getByRole('button', { name: c.link })).toBeInTheDocument()
})

it('starts the OAuth round-trip on click, returning to this pane on either outcome', async () => {
  renderWithIntl(<ConnectionsPane linked={false} configured />)
  await userEvent.click(screen.getByRole('button', { name: c.link }))
  expect(m.linkSocial).toHaveBeenCalledWith(
    expect.objectContaining({
      provider: 'discord',
      callbackURL: '/settings/connections',
      // Without this the callback's failure redirect lands on Better Auth's
      // bare /api/auth/error page instead of back here.
      errorCallbackURL: '/settings/connections',
    }),
  )
})

it('shows the linked state and unlinks on request', async () => {
  renderWithIntl(<ConnectionsPane linked configured />)
  expect(screen.getByText(c.linked)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  expect(m.unlinkAccount).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'discord' }))
  expect(m.refresh).toHaveBeenCalled()
})

it('reports a failed unlink instead of silently doing nothing', async () => {
  m.unlinkAccount.mockResolvedValue({ data: null, error: { message: 'nope' } })
  renderWithIntl(<ConnectionsPane linked configured />)
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  expect(await screen.findByRole('alert')).toHaveTextContent(c.unlinkError)
  expect(m.refresh).not.toHaveBeenCalled()
})

it('surfaces a callback failure carried back as a query param', () => {
  renderWithIntl(<ConnectionsPane linked={false} configured linkError="unable_to_link_account" />)
  expect(screen.getByRole('alert')).toHaveTextContent(c.error)
})

it('names the conflict when the account belongs to someone else', () => {
  renderWithIntl(
    <ConnectionsPane linked={false} configured linkError="account_already_linked_to_different_user" />,
  )
  expect(screen.getByRole('alert')).toHaveTextContent(c.alreadyLinked)
})

it('explains itself instead of rendering a dead button when unconfigured', () => {
  renderWithIntl(<ConnectionsPane linked={false} configured={false} />)
  expect(screen.getByText(c.unavailable)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: c.link })).not.toBeInTheDocument()
})
