'use server'
import { recordTermsAcceptance } from '@revelio/db'
import { getDb } from '@/lib/server/db'
import { getSession } from '@/lib/server/session'
import { TERMS_VERSION } from '@/lib/terms'

export type AcceptTermsResult = { ok: true } | { ok: false; error: 'unauthorized' }

// Deliberately takes no arguments. The user comes from the session, the version
// from the server's constant and the time from the server clock, so a caller can
// neither accept for someone else, nor claim a version it was not shown, nor
// back-date the record.
export async function acceptTermsAction(): Promise<AcceptTermsResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  await recordTermsAcceptance(getDb(), session.user.id, TERMS_VERSION, new Date())
  return { ok: true }
}
