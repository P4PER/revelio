'use server'
import { revalidatePath } from 'next/cache'
import { unlinkProvider } from '@revelio/db'
import { getSession } from '@/lib/server/session'
import { getDb } from '@/lib/server/db'

export type ConnectionResult = { ok: true } | { ok: false; error: string }

// Linking runs through Better Auth's OAuth round-trip, but unlinking does not:
// see the note on `unlinkProvider` in @revelio/db for why its /unlink-account
// endpoint is unusable here. The user id comes from the session, so a caller
// can only ever detach their own account.
export async function unlinkDiscord(): Promise<ConnectionResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  try {
    const removed = await unlinkProvider(getDb(), session.user.id, 'discord')
    if (removed === 0) return { ok: false, error: 'notLinked' }
    revalidatePath('/settings/connections')
    return { ok: true }
  } catch {
    return { ok: false, error: 'failed' }
  }
}
