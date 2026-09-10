'use server'
import { revalidatePath } from 'next/cache'
import { unlinkProvider } from '@revelio/db'
import { getSession } from '@/lib/server/session'
import { getDb } from '@/lib/server/db'
import { revokeDiscordAuthorization } from '@/lib/server/discord-oauth'

export type ConnectionResult = { ok: true } | { ok: false; error: string }

// Linking runs through Better Auth's OAuth round-trip, but unlinking does not:
// see the note on `unlinkProvider` in @revelio/db for why its /unlink-account
// endpoint is unusable here. The user id comes from the session, so a caller
// can only ever detach their own account.
export async function unlinkDiscord(): Promise<ConnectionResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  let removed
  try {
    removed = await unlinkProvider(getDb(), session.user.id, 'discord')
  } catch {
    return { ok: false, error: 'failed' }
  }
  if (removed.length === 0) return { ok: false, error: 'notLinked' }

  // Deleting our row ends the link on our side; without this the authorization
  // lives on in the user's Discord "Authorized Apps" and its tokens stay valid
  // until they expire. Best-effort on purpose and after the delete: the user
  // asked to detach from Revelio, and Discord being unreachable must not undo
  // that or report a failure for something that already succeeded.
  await revokeDiscordAuthorization(removed.flatMap((r) => [r.accessToken, r.refreshToken]))

  revalidatePath('/settings/connections')
  return { ok: true }
}
