'use server'
import { sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { user } from '@revelio/db'

/**
 * Whether an account already exists for `email` (case-insensitive).
 * Used by the /login page to reject unknown emails before sending an OTP —
 * account creation happens only via /register.
 */
export async function emailHasAccount(email: string): Promise<boolean> {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  const db = getDb()
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.email}) = ${normalized}`)
    .limit(1)
  return rows.length > 0
}

/**
 * Whether `username` is free (case-insensitive). Used by /register to reject a
 * taken username before sending an OTP. The DB `unique` constraint is the final
 * guard; this is the friendly pre-check.
 */
export async function usernameAvailable(username: string): Promise<boolean> {
  const normalized = username.trim().toLowerCase()
  if (!normalized) return false
  const db = getDb()
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(sql`lower(${user.username}) = ${normalized}`)
    .limit(1)
  return rows.length === 0
}
