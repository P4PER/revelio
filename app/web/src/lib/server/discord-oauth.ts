import 'server-only'

const REVOKE_ENDPOINT = 'https://discord.com/api/oauth2/token/revoke'

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
