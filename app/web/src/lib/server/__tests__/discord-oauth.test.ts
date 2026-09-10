import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { revokeDiscordAuthorization } from '../discord-oauth'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubEnv('DISCORD_CLIENT_ID', 'client-id')
  vi.stubEnv('DISCORD_CLIENT_SECRET', 'client-secret')
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it('posts the token to Discord with basic auth and form encoding', async () => {
  expect(await revokeDiscordAuthorization(['access-abc'])).toBe(true)
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('https://discord.com/api/oauth2/token/revoke')
  expect(init.method).toBe('POST')
  expect(init.headers.Authorization)
    .toBe(`Basic ${Buffer.from('client-id:client-secret').toString('base64')}`)
  expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
  expect(init.body.get('token')).toBe('access-abc')
})

// Revoking any one token kills the whole authorization, so a second call would
// be wasted work.
it('stops after the first token Discord accepts', async () => {
  await revokeDiscordAuthorization(['access-abc', 'refresh-xyz'])
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('falls back to the refresh token when the access token is rejected', async () => {
  fetchMock
    .mockResolvedValueOnce({ ok: false, status: 400 })
    .mockResolvedValueOnce({ ok: true, status: 200 })
  expect(await revokeDiscordAuthorization(['expired', 'refresh-xyz'])).toBe(true)
  expect(fetchMock.mock.calls[1][1].body.get('token')).toBe('refresh-xyz')
})

it('skips absent tokens rather than posting null', async () => {
  await revokeDiscordAuthorization([null, undefined, 'refresh-xyz'])
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0][1].body.get('token')).toBe('refresh-xyz')
})

// Unlinking must not depend on Discord being reachable.
it('reports failure instead of throwing when Discord is unreachable', async () => {
  fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
  expect(await revokeDiscordAuthorization(['access-abc'])).toBe(false)
})

it('does nothing when linking is not configured', async () => {
  vi.stubEnv('DISCORD_CLIENT_SECRET', '')
  expect(await revokeDiscordAuthorization(['access-abc'])).toBe(false)
  expect(fetchMock).not.toHaveBeenCalled()
})

// The token must never reach a log line.
it('does not log the token when revocation fails', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 401 })
  await revokeDiscordAuthorization(['super-secret-token'])
  const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.flat().join(' ')
  expect(logged).not.toContain('super-secret-token')
})
