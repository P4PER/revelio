import { it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import en from '@/../messages/en.json'
import { renderWithIntl } from '@/test/intl'

const m = vi.hoisted(() => ({
  linkSocial: vi.fn(async () => ({ data: { url: 'https://discord.test/oauth' }, error: null })),
  unlinkDiscord: vi.fn(async () => ({ ok: true })),
  refresh: vi.fn(),
}))
vi.mock('@/lib/auth-client', () => ({ authClient: { linkSocial: m.linkSocial } }))
vi.mock('@/lib/actions/connections-actions', () => ({ unlinkDiscord: m.unlinkDiscord }))
vi.mock('@/../i18n/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }))

import { ConnectionsPane } from '../connections-pane'

const c = en.settings.connections

beforeEach(() => {
  m.linkSocial.mockReset().mockResolvedValue({ data: { url: 'https://discord.test/oauth' }, error: null })
  m.unlinkDiscord.mockReset().mockResolvedValue({ ok: true })
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

// Unlinking goes through our own server action, not Better Auth's
// /unlink-account: that endpoint's fresh-session middleware answers 403 for any
// session older than a day, which is most of them.
it('shows the linked state and unlinks on request', async () => {
  renderWithIntl(<ConnectionsPane linked configured />)
  expect(screen.getByText(c.linked)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  expect(m.unlinkDiscord).toHaveBeenCalled()
  expect(m.refresh).toHaveBeenCalled()
})

// The whole point of the rework: you can see which Discord account the bot
// answers for, not just that some account is attached.
it('names the linked Discord account', () => {
  renderWithIntl(<ConnectionsPane linked configured accountName="timonw" />)
  expect(screen.getByText('@timonw')).toBeInTheDocument()
  expect(screen.getByText(c.linked)).toBeInTheDocument()
})

// Discord being unreachable must cost the handle, not the pane.
it('keeps the linked badge when Discord did not give up a name', () => {
  renderWithIntl(<ConnectionsPane linked configured accountName={null} />)
  expect(screen.getByText(c.linked)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: c.unlink })).toBeInTheDocument()
  expect(screen.queryByText(/^@/)).not.toBeInTheDocument()
})

it('says so in the row when nothing is linked yet', () => {
  renderWithIntl(<ConnectionsPane linked={false} configured />)
  expect(screen.getByText(c.notLinked)).toBeInTheDocument()
})

// The row is the only place the bot's two commands are explained, in every
// state where linking is possible at all.
it.each([true, false])('explains what the link is for when linked=%s', (linked) => {
  renderWithIntl(<ConnectionsPane linked={linked} configured accountName="timonw" />)
  expect(screen.getByText(c.discordBody)).toBeInTheDocument()
})

it('reports a failed unlink instead of silently doing nothing', async () => {
  m.unlinkDiscord.mockResolvedValue({ ok: false, error: 'failed' })
  renderWithIntl(<ConnectionsPane linked configured />)
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  expect(await screen.findByRole('alert')).toHaveTextContent(c.unlinkError)
  expect(m.refresh).not.toHaveBeenCalled()
})

// linkSocial resolves with {error} rather than throwing, so an unchecked call
// leaves the button looking dead.
it('reports a link that never got off the ground', async () => {
  m.linkSocial.mockResolvedValue({ data: null, error: { message: 'nope' } })
  renderWithIntl(<ConnectionsPane linked={false} configured />)
  await userEvent.click(screen.getByRole('button', { name: c.link }))
  expect(await screen.findByRole('alert')).toHaveTextContent(c.error)
})

it('surfaces a callback failure carried back as a query param', () => {
  // An error code with no message of its own falls back to the generic line.
  renderWithIntl(<ConnectionsPane linked={false} configured linkError="internal_server_error" />)
  expect(screen.getByRole('alert')).toHaveTextContent(c.error)
})

// Retrying can never fix an unverified Discord email, so the generic "try
// again" would be a loop with no exit.
it('explains an unverified Discord email rather than saying try again', () => {
  renderWithIntl(<ConnectionsPane linked={false} configured linkError="unable_to_link_account" />)
  expect(screen.getByRole('alert')).toHaveTextContent(c.unverifiedDiscord)
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
