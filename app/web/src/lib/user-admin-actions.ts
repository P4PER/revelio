'use server'
import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/session'
import { getDb } from '@/lib/db'
import {
  getUserForAdmin, countAdmins, updateUserRole, setUserBan, clearUserBan, deleteUserById,
} from '@revelio/db'

export type UserActionResult = { ok: true } | { ok: false; error: string }

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
): Promise<UserActionResult> {
  const session = await requireRole('admin')
  if (userId === session.user.id) return { ok: false, error: 'self' }
  const expires = expiresAt ? new Date(expiresAt) : null
  if (expires && Number.isNaN(expires.getTime())) return { ok: false, error: 'invalid' }
  const db = getDb()
  await setUserBan(db, userId, reason.trim() || null, expires)
  revalidateUser(userId)
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
  await deleteUserById(db, userId)
  revalidatePath('/admin/users')
  return { ok: true }
}
