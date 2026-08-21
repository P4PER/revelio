'use server'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/server/session'
import { getDb } from '@/lib/server/db'
import { user, deleteUserById, getUserExport, type UserExport } from '@revelio/db'
import { usernameAvailable, emailHasAccount } from '@/lib/actions/auth-actions'
import { generateCode, storeCode, consumeCode, emailChangeId, deleteId } from '@/lib/server/account-codes'
import { renderOtpEmail } from '@/lib/email/otp-template'
import { sendMail } from '@/lib/email/mailer'
import { getCachedSiteSettings } from '@/lib/server/site-settings'

export type SettingsResult = { ok: true } | { ok: false; error: string }

const norm = (s: string) => s.trim().toLowerCase()

export async function updateUsername(username: string): Promise<SettingsResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  const value = username.trim()
  if (!value) return { ok: false, error: 'invalid' }
  if (norm(value) === norm(session.user.username ?? '')) return { ok: false, error: 'unchanged' }
  if (!(await usernameAvailable(value))) return { ok: false, error: 'taken' }
  try {
    const db = getDb()
    await db.update(user).set({ username: value, displayUsername: value }).where(eq(user.id, session.user.id))
    revalidatePath('/settings')
    return { ok: true }
  } catch {
    return { ok: false, error: 'taken' } // unique-violation race
  }
}

async function sendCodeMail(to: string, otp: string, type: 'change-email' | 'delete-account') {
  const settings = await getCachedSiteSettings()
  const { subject, html, text } = await renderOtpEmail({ otp, type, contactEmail: settings?.contactEmail ?? '' })
  await sendMail({ to, subject, html, text })
}

export async function requestEmailChange(newEmail: string): Promise<SettingsResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  const value = newEmail.trim()
  if (!value) return { ok: false, error: 'invalid' }
  if (norm(value) === norm(session.user.email)) return { ok: false, error: 'same-email' }
  if (await emailHasAccount(value)) return { ok: false, error: 'email-taken' }
  try {
    const code = generateCode()
    await storeCode(emailChangeId(session.user.id), code, { newEmail: value })
    await sendCodeMail(value, code, 'change-email')
    return { ok: true }
  } catch {
    return { ok: false, error: 'failed' }
  }
}

export async function confirmEmailChange(code: string): Promise<SettingsResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  const extra = await consumeCode(emailChangeId(session.user.id), code.trim())
  if (!extra?.newEmail) return { ok: false, error: 'code' }
  try {
    const db = getDb()
    await db.update(user).set({ email: extra.newEmail, emailVerified: true }).where(eq(user.id, session.user.id))
    revalidatePath('/settings')
    return { ok: true }
  } catch {
    return { ok: false, error: 'email-taken' } // unique-violation race
  }
}

export async function requestAccountDeletion(): Promise<SettingsResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  try {
    const code = generateCode()
    await storeCode(deleteId(session.user.id), code)
    await sendCodeMail(session.user.email, code, 'delete-account')
    return { ok: true }
  } catch {
    return { ok: false, error: 'failed' }
  }
}

export async function confirmAccountDeletion(code: string): Promise<SettingsResult> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  const extra = await consumeCode(deleteId(session.user.id), code.trim())
  if (!extra) return { ok: false, error: 'code' }
  // DB cascades remove decks/collection/likes/views/sessions off user.id.
  await deleteUserById(getDb(), session.user.id)
  return { ok: true }
}

export async function exportMyData(): Promise<{ ok: true; data: UserExport } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session?.user) return { ok: false, error: 'unauthorized' }
  try {
    return { ok: true, data: await getUserExport(getDb(), session.user.id) }
  } catch {
    return { ok: false, error: 'failed' }
  }
}
