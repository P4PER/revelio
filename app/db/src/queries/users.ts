import { eq, desc, count } from 'drizzle-orm'
import type { DB } from '../client'
import { decks } from '../schema'
import { user, session } from '../auth-schema'

export type UserAdminRow = {
  id: string
  email: string
  emailVerified: boolean
  image: string | null
  username: string | null
  displayUsername: string | null
  role: string
  banned: boolean
  createdAt: Date
}

export type UserAdminDetail = UserAdminRow & {
  banReason: string | null
  banExpires: Date | null
}

export async function listUsersForAdmin(db: DB): Promise<UserAdminRow[]> {
  const rows = await db.select().from(user).orderBy(desc(user.createdAt))
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    emailVerified: r.emailVerified,
    image: r.image,
    username: r.username,
    displayUsername: r.displayUsername,
    role: r.role ?? 'user',
    banned: r.banned ?? false,
    createdAt: r.createdAt,
  }))
}

export async function getUserForAdmin(db: DB, id: string): Promise<UserAdminDetail | null> {
  const [r] = await db.select().from(user).where(eq(user.id, id)).limit(1)
  if (!r) return null
  return {
    id: r.id,
    email: r.email,
    emailVerified: r.emailVerified,
    image: r.image,
    username: r.username,
    displayUsername: r.displayUsername,
    role: r.role ?? 'user',
    banned: r.banned ?? false,
    createdAt: r.createdAt,
    banReason: r.banReason,
    banExpires: r.banExpires,
  }
}

export async function countAdmins(db: DB): Promise<number> {
  const [row] = await db.select({ n: count() }).from(user).where(eq(user.role, 'admin'))
  return Number(row?.n ?? 0)
}

export async function countUserDecks(db: DB, userId: string): Promise<number> {
  const [row] = await db.select({ n: count() }).from(decks).where(eq(decks.userId, userId))
  return Number(row?.n ?? 0)
}

export async function updateUserRole(db: DB, id: string, role: string): Promise<void> {
  await db.update(user).set({ role }).where(eq(user.id, id))
}

// Deletes the banned user's sessions alongside the flag write. Better Auth's
// admin plugin only reads `banned` in its session.create.before hook, i.e. on
// the sign-in path, so without this a user banned mid-session keeps browsing
// until their session row expires. Its own /admin/ban-user route pairs the two
// the same way; this writes the flags directly, so it owns the pairing. One
// transaction, so a ban can never land with live sessions left behind.
export async function setUserBan(
  db: DB, id: string, reason: string | null, expires: Date | null,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(user)
      .set({ banned: true, banReason: reason, banExpires: expires })
      .where(eq(user.id, id))
    await tx.delete(session).where(eq(session.userId, id))
  })
}

export async function clearUserBan(db: DB, id: string): Promise<void> {
  await db.update(user)
    .set({ banned: false, banReason: null, banExpires: null })
    .where(eq(user.id, id))
}

export async function deleteUserById(db: DB, id: string): Promise<void> {
  await db.delete(user).where(eq(user.id, id))
}
