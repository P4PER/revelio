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

import { DiscordConnection } from '../discord-connection'

const c = en.settings.connections

beforeEach(() => {
  m.linkSocial.mockReset().mockResolvedValue({ data: { url: 'https://discord.test/oauth' }, error: null })
  m.unlinkDiscord.mockReset().mockResolvedValue({ ok: true })
  m.refresh.mockReset()
})

it('offers to link when Discord is not connected', () => {
  renderWithIntl(<DiscordConnection linked={false} configured />)
  expect(screen.getByRole('button', { name: c.link })).toBeInTheDocument()
})

it('starts the OAuth round-trip on click, returning to this pane on either outcome', async () => {
  renderWithIntl(<DiscordConnection linked={false} configured />)
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
it('unlinks once the dialog is confirmed', async () => {
  renderWithIntl(<DiscordConnection linked configured accountName="timonw" />)
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  await userEvent.click(screen.getByRole('button', { name: c.confirmUnlink }))
  expect(m.unlinkDiscord).toHaveBeenCalled()
  expect(m.refresh).toHaveBeenCalled()
})

// Unlinking also revokes the authorization at Discord, so it must not fire on
// a stray click at the row.
it('asks before touching the account', async () => {
  renderWithIntl(<DiscordConnection linked configured accountName="timonw" />)
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  expect(await screen.findByRole('alertdialog')).toHaveTextContent(c.unlinkTitle)
  expect(m.unlinkDiscord).not.toHaveBeenCalled()
})

it('names the account in the confirmation so it is clear which one goes', async () => {
  renderWithIntl(<DiscordConnection linked configured accountName="timonw" />)
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  expect(await screen.findByRole('alertdialog'))
    .toHaveTextContent(c.unlinkBodyNamed.replace('{name}', '@timonw'))
})

it('falls back to the nameless wording when the handle is unknown', async () => {
  renderWithIntl(<DiscordConnection linked configured accountName={null} />)
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  expect(await screen.findByRole('alertdialog')).toHaveTextContent(c.unlinkBody)
})

it('leaves the account alone when the dialog is cancelled', async () => {
  renderWithIntl(<DiscordConnection linked configured accountName="timonw" />)
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  await userEvent.click(screen.getByRole('button', { name: c.cancel }))
  expect(m.unlinkDiscord).not.toHaveBeenCalled()
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

// The whole point of the rework: you can see which Discord account the bot
// answers for, not just that some account is attached.
it('names the linked Discord account', () => {
  renderWithIntl(<DiscordConnection linked configured accountName="timonw" />)
  expect(screen.getByText('@timonw')).toBeInTheDocument()
  expect(screen.getByText(c.linked)).toBeInTheDocument()
})

// Discord being unreachable must cost the handle, not the pane.
it('keeps the linked badge when Discord did not give up a name', () => {
  renderWithIntl(<DiscordConnection linked configured accountName={null} />)
  expect(screen.getByText(c.linked)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: c.unlink })).toBeInTheDocument()
  expect(screen.queryByText(/^@/)).not.toBeInTheDocument()
})

it('says so in the row when nothing is linked yet', () => {
  renderWithIntl(<DiscordConnection linked={false} configured />)
  expect(screen.getByText(c.notLinked)).toBeInTheDocument()
})

// The row is the only place the bot's two commands are explained, in every
// state where linking is possible at all.
it.each([true, false])('explains what the link is for when linked=%s', (linked) => {
  renderWithIntl(<DiscordConnection linked={linked} configured accountName="timonw" />)
  expect(screen.getByText(c.discordBody)).toBeInTheDocument()
})

// The error line lives in the pane, behind the dialog, so the dialog has to
// get out of the way for the message to be readable.
it('closes the dialog and reports a failed unlink instead of silently doing nothing', async () => {
  m.unlinkDiscord.mockResolvedValue({ ok: false, error: 'failed' })
  renderWithIntl(<DiscordConnection linked configured accountName="timonw" />)
  await userEvent.click(screen.getByRole('button', { name: c.unlink }))
  await userEvent.click(screen.getByRole('button', { name: c.confirmUnlink }))
  expect(await screen.findByRole('alert')).toHaveTextContent(c.unlinkError)
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(m.refresh).not.toHaveBeenCalled()
})

// linkSocial resolves with {error} rather than throwing, so an unchecked call
// leaves the button looking dead.
it('reports a link that never got off the ground', async () => {
  m.linkSocial.mockResolvedValue({ data: null, error: { message: 'nope' } })
  renderWithIntl(<DiscordConnection linked={false} configured />)
  await userEvent.click(screen.getByRole('button', { name: c.link }))
  expect(await screen.findByRole('alert')).toHaveTextContent(c.error)
})

it('surfaces a callback failure carried back as a query param', () => {
  // An error code with no message of its own falls back to the generic line.
  renderWithIntl(<DiscordConnection linked={false} configured linkError="internal_server_error" />)
  expect(screen.getByRole('alert')).toHaveTextContent(c.error)
})

// Retrying can never fix an unverified Discord email, so the generic "try
// again" would be a loop with no exit.
it('explains an unverified Discord email rather than saying try again', () => {
  renderWithIntl(<DiscordConnection linked={false} configured linkError="unable_to_link_account" />)
  expect(screen.getByRole('alert')).toHaveTextContent(c.unverifiedDiscord)
})

it('names the conflict when the account belongs to someone else', () => {
  renderWithIntl(
    <DiscordConnection linked={false} configured linkError="account_already_linked_to_different_user" />,
  )
  expect(screen.getByRole('alert')).toHaveTextContent(c.alreadyLinked)
})

it('explains itself instead of rendering a dead button when unconfigured', () => {
  renderWithIntl(<DiscordConnection linked={false} configured={false} />)
  expect(screen.getByText(c.unavailable)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: c.link })).not.toBeInTheDocument()
})
