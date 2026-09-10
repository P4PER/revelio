'use server'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/server/session'
import { unlinkAndRevokeDiscord } from '@/lib/server/discord-oauth'

export type ConnectionResult = { ok: true } | { ok: false; error: string }

// Linking runs through Better Auth's OAuth round-trip, but unlinking does not:
// see the note on `unlinkProvider` in @revelio/db for why its /unlink-account
// endpoint is unusable here. The user id comes from the session, so a caller
// can only ever detach their own account.
export async function unlinkDiscord(): Promise<ConnectionResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  let removed: number
  try {
    // Revocation inside here is best-effort and runs after the delete: the user
    // asked to detach from Revelio, so Discord being unreachable must not undo
    // that or report a failure for something that already succeeded.
    removed = await unlinkAndRevokeDiscord(session.user.id)
  } catch {
    return { ok: false, error: 'failed' }
  }
  if (removed === 0) return { ok: false, error: 'notLinked' }

  revalidatePath('/settings/connections')
  return { ok: true }
}
