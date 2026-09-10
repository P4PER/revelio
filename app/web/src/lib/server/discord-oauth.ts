import 'server-only'

import { symmetricDecrypt } from 'better-auth/crypto'
import { unlinkProvider } from '@revelio/db'
import { auth } from '@/lib/server/auth'
import { getDb } from '@/lib/server/db'

const REVOKE_ENDPOINT = 'https://discord.com/api/oauth2/token/revoke'
const USER_ENDPOINT = 'https://discord.com/api/users/@me'
// The name is decoration on a page that must still render, so a hung Discord
// gets a couple of seconds rather than undici's 300s default.
const NAME_FETCH_TIMEOUT_MS = 3000

// account.encryptOAuthTokens is on, so what the account row holds is ciphertext
// and posting it to Discord revokes nothing. The key comes from the auth context
// rather than BETTER_AUTH_SECRET directly so that a versioned secret keeps
// working. Anything that fails to decrypt is used as-is: a row written before
// encryption was enabled is plaintext already, and abandoning its revocation
// would leave exactly the live authorization unlinking exists to end.
//
// That fallback has to be logged, because it cannot be seen from the response:
// RFC 7009 has Discord answer 200 to a token it does not recognise, so posting
// an undecryptable value reports a successful unlink while the authorization
// stays live. Expected once per pre-encryption row; anything more means the key
// no longer matches what the tokens were encrypted with.
async function decryptToken(token: string | null): Promise<string | null> {
  if (!token) return null
  try {
    return await symmetricDecrypt({ key: (await auth.$context).secretConfig, data: token })
  } catch {
    console.error('Discord token did not decrypt; revoking with the stored value instead')
    return token
  }
}

// Discord revokes the whole authorization from any one of its tokens: "any
// active access or refresh tokens associated with that authorization will be
// revoked, regardless of the token and token_type_hint values you pass in".
// So one successful call is enough, and the refresh token is only a fallback
// for when the access token has already expired.
export async function revokeDiscordAuthorization(
  tokens: Array<string | null | undefined>,
): Promise<boolean> {
  const clientId = process.env.DISCORD_CLIENT_ID
  const clientSecret = process.env.DISCORD_CLIENT_SECRET
  if (!clientId || !clientSecret) return false

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  for (const token of tokens) {
    if (!token) continue
    try {
      const res = await fetch(REVOKE_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ token }),
      })
      if (res.ok) return true
      // Deliberately not logging the body: it echoes the token back on some
      // error shapes, and this runs on the server where logs are retained.
      console.error(`Discord token revocation failed with ${res.status}`)
    } catch {
      console.error('Discord token revocation could not reach Discord')
    }
  }
  return false
}

// Every path that ends a user's Discord link goes through here: the Connections
// pane, self-deletion, and admin deletion. Deleting the user alone would drop
// the account row through the foreign key and lose the tokens without revoking
// them, leaving Revelio in the user's Discord authorised apps with a live
// authorization - the exact thing unlinking exists to prevent.
export async function unlinkAndRevokeDiscord(userId: string): Promise<number> {
  const removed = await unlinkProvider(getDb(), userId, 'discord')
  if (removed.length === 0) return 0
  const tokens = await Promise.all(
    removed.flatMap((r) => [r.accessToken, r.refreshToken]).map(decryptToken),
  )
  await revokeDiscordAuthorization(tokens)
  return removed.length
}

// The Connections pane names the linked account, and the account row holds only
// the snowflake - so the display name comes from Discord on demand. Storing it
// would need a migration and would go stale the moment someone renames.
//
// The token comes from Better Auth rather than account.accessToken because the
// stored value is ciphertext and Discord access tokens last a week:
// getAccessToken decrypts it, refreshes it through the provider when it has
// expired, and persists the new pair. Passing userId with no headers is the
// server-trusted path; it throws an APIError on anything it cannot resolve.
//
// Every failure returns null: the name is decoration, and the pane renders the
// plain linked state without it. A settings page must not break because
// Discord is having a bad day - which includes being slow, since the page
// awaits this inline, hence the abort signal as well as the try/catch.
export async function getDiscordAccountName(userId: string): Promise<string | null> {
  let accessToken: string | undefined
  try {
    const tokens = await auth.api.getAccessToken({ body: { providerId: 'discord', userId } })
    accessToken = tokens.accessToken
  } catch {
    return null
  }
  if (!accessToken) return null

  try {
    const res = await fetch(USER_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(NAME_FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    // username, not global_name: the pane prints this behind an "@", and a
    // global_name is a free-form display name that may carry spaces and capitals
    // ("@Timon Wegener" reads as a handle that does not exist). The username is
    // the unique handle, and Discord always returns one.
    const profile = (await res.json()) as { global_name?: string | null; username?: string | null }
    return profile.username || profile.global_name || null
  } catch {
    return null
  }
}
