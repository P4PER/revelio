'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/server/session'
import { getDb } from '@/lib/server/db'
import { unlinkAndRevokeDiscord } from '@/lib/server/discord-oauth'
import { renderBanEmail } from '@/lib/email/ban-template'
import { sendMail } from '@/lib/email/mailer'
import {
  getUserForAdmin, countAdmins, updateUserRole, setUserBan, clearUserBan, deleteUserById,
} from '@revelio/db'

export type UserActionResult = { ok: true } | { ok: false; error: string }

// A ban whose notice could not be emailed still succeeded: the ban stands and
// the admin form tells the admin to send the reasons by hand.
export type BanUserResult = UserActionResult | { ok: true; warning: 'notify-failed' }

const ROLES = ['user', 'editor', 'admin'] as const

function revalidateUser(userId: string) {
  revalidatePath('/admin/users')
  revalidatePath(`/admin/users/${userId}/edit`)
}

// True when removing/demoting `userId`'s admin status would leave zero admins.
async function wouldOrphanAdmins(db: ReturnType<typeof getDb>, userId: string): Promise<boolean> {
  const target = await getUserForAdmin(db, userId)
  if (target?.role !== 'admin') return false
  return (await countAdmins(db)) <= 1
}

export async function setUserRole(userId: string, role: string): Promise<UserActionResult> {
  const session = await requireRole('admin')
  if (!(ROLES as readonly string[]).includes(role)) return { ok: false, error: 'invalid' }
  if (userId === session.user.id) return { ok: false, error: 'self' }
  const db = getDb()
  if (role !== 'admin' && (await wouldOrphanAdmins(db, userId))) {
    return { ok: false, error: 'last-admin' }
  }
  await updateUserRole(db, userId, role)
  revalidateUser(userId)
  return { ok: true }
}

export async function banUser(
  userId: string, reason: string, expiresAt: string | null,
): Promise<BanUserResult> {
  const session = await requireRole('admin')
  if (userId === session.user.id) return { ok: false, error: 'self' }
  // Art. 17(3) DSA: the statement of reasons must give the facts and grounds.
  const trimmed = reason.trim()
  if (!trimmed) return { ok: false, error: 'reason-required' }
  const expires = expiresAt ? new Date(expiresAt) : null
  if (expires && Number.isNaN(expires.getTime())) return { ok: false, error: 'invalid' }
  const db = getDb()
  const target = await getUserForAdmin(db, userId)
  if (!target) return { ok: false, error: 'not-found' }
  await setUserBan(db, userId, trimmed, expires)
  revalidateUser(userId)
  try {
    const mail = await renderBanEmail({ reason: trimmed, expiresAt: expires })
    await sendMail({ to: target.email, ...mail })
  } catch {
    // Never log the reason or the address: both are personal data.
    console.error('could not send the ban notice')
    return { ok: true, warning: 'notify-failed' }
  }
  return { ok: true }
}

export async function unbanUser(userId: string): Promise<UserActionResult> {
  await requireRole('admin')
  await clearUserBan(getDb(), userId)
  revalidateUser(userId)
  return { ok: true }
}

export async function deleteUser(userId: string): Promise<UserActionResult> {
  const session = await requireRole('admin')
  if (userId === session.user.id) return { ok: false, error: 'self' }
  const db = getDb()
  if (await wouldOrphanAdmins(db, userId)) return { ok: false, error: 'last-admin' }
  // See confirmAccountDeletion: revoke before the cascade discards the tokens.
  try {
    await unlinkAndRevokeDiscord(userId)
  } catch {
    console.error('could not revoke the Discord link while deleting a user')
  }
  await deleteUserById(db, userId)
  revalidatePath('/admin/users')
  return { ok: true }
}
