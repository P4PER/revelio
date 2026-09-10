import { it, expect, vi, beforeEach, afterEach } from 'vitest'
import { symmetricEncrypt } from 'better-auth/crypto'
import { revokeDiscordAuthorization, unlinkAndRevokeDiscord } from '../discord-oauth'

const TEST_SECRET = 'test-secret'

const fetchMock = vi.fn()
const unlinkProviderMock = vi.fn()

vi.mock('@revelio/db', () => ({ unlinkProvider: (...args: unknown[]) => unlinkProviderMock(...args) }))
vi.mock('@/lib/server/db', () => ({ getDb: () => ({}) }))
// The real module builds a Postgres client and a mailer at import time, and the
// only thing needed from it here is the key the tokens were encrypted with.
vi.mock('@/lib/server/auth', () => ({
  auth: { $context: Promise.resolve({ secretConfig: 'test-secret' }) },
}))

beforeEach(() => {
  unlinkProviderMock.mockReset()
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

// The account row holds ciphertext once account.encryptOAuthTokens is on, and
// Discord would shrug at it: revocation only works on the real token.
it('decrypts stored tokens before posting them to Discord', async () => {
  const stored = await symmetricEncrypt({ key: TEST_SECRET, data: 'real-access-token' })
  expect(stored).not.toBe('real-access-token')
  unlinkProviderMock.mockResolvedValue([{ accessToken: stored, refreshToken: null }])

  expect(await unlinkAndRevokeDiscord('user-1')).toBe(1)
  expect(fetchMock.mock.calls[0][1].body.get('token')).toBe('real-access-token')
})

// Rows written before encryption was enabled are still plaintext, and they are
// exactly the ones most likely to hold a live authorization.
it('posts a legacy plaintext token unchanged', async () => {
  unlinkProviderMock.mockResolvedValue([{ accessToken: 'access-abc', refreshToken: null }])

  await unlinkAndRevokeDiscord('user-1')
  expect(fetchMock.mock.calls[0][1].body.get('token')).toBe('access-abc')
})

// A plaintext token that happens to look like ciphertext fails to decrypt.
// Trying the stored value beats abandoning the revocation.
it('falls back to the stored value when decryption fails', async () => {
  unlinkProviderMock.mockResolvedValue([{ accessToken: 'deadbeef', refreshToken: null }])

  await unlinkAndRevokeDiscord('user-1')
  expect(fetchMock.mock.calls[0][1].body.get('token')).toBe('deadbeef')
})

// Discord answers 200 to a token it does not recognise, so nothing downstream
// can tell that the value posted was never a real token. The log is the only
// signal that a key no longer matches its ciphertext.
it('logs the fallback without putting the token in the log line', async () => {
  unlinkProviderMock.mockResolvedValue([{ accessToken: 'deadbeef', refreshToken: null }])

  await unlinkAndRevokeDiscord('user-1')
  const logged = (console.error as unknown as { mock: { calls: unknown[][] } }).mock.calls.flat().join(' ')
  expect(logged).toContain('did not decrypt')
  expect(logged).not.toContain('deadbeef')
})

it('does not call Discord when there was no link to remove', async () => {
  unlinkProviderMock.mockResolvedValue([])

  expect(await unlinkAndRevokeDiscord('user-1')).toBe(0)
  expect(fetchMock).not.toHaveBeenCalled()
})
