import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { schema } from '@revelio/db'
import {
  listUsersForAdmin, getUserForAdmin, countAdmins, countUserDecks,
  updateUserRole, setUserBan, clearUserBan, deleteUserById,
} from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

async function seedUser(id: string, over: Partial<typeof schema.user.$inferInsert> = {}) {
  await ctx.db.insert(schema.user).values({
    id, name: `User ${id}`, email: `${id}@x.test`, emailVerified: true,
    role: 'user', banned: false, ...over,
  })
}

async function seedSession(id: string, userId: string) {
  await ctx.db.insert(schema.session).values({
    id, userId, token: `${id}-token`,
    expiresAt: new Date('2030-01-01T00:00:00Z'), updatedAt: new Date(),
  })
}

async function sessionIds(userId: string): Promise<string[]> {
  const rows = await ctx.db.select({ id: schema.session.id })
    .from(schema.session).where(eq(schema.session.userId, userId))
  return rows.map((r) => r.id)
}

beforeAll(async () => {
  ctx = await withMigratedDb()
  await seedUser('u1', { role: 'admin' })
  await seedUser('u2', { role: 'editor', username: 'ed', displayUsername: 'Ed' })
  await seedUser('u3', { role: 'user', banned: true, banReason: 'spam' })
  await ctx.db.insert(schema.decks).values({
    id: 'd1', userId: 'u2', name: 'Deck', format: 'standard',
  })
}, 60_000)

afterAll(async () => { await ctx.stop() })

describe('user-admin queries', () => {
  it('lists all users with the row shape the table needs', async () => {
    const rows = await listUsersForAdmin(ctx.db)
    expect(rows).toHaveLength(3)
    const u2 = rows.find((r) => r.id === 'u2')!
    expect(u2).toMatchObject({ role: 'editor', username: 'ed', displayUsername: 'Ed', banned: false })
    expect(u2.createdAt).toBeInstanceOf(Date)
  })

  it('normalizes a null role to "user"', async () => {
    await seedUser('u4', { role: null })
    const rows = await listUsersForAdmin(ctx.db)
    expect(rows.find((r) => r.id === 'u4')!.role).toBe('user')
    await deleteUserById(ctx.db, 'u4')
  })

  it('reads one user with ban detail', async () => {
    const d = await getUserForAdmin(ctx.db, 'u3')
    expect(d).toMatchObject({ id: 'u3', banned: true, banReason: 'spam' })
    expect(await getUserForAdmin(ctx.db, 'nope')).toBeNull()
  })

  it('counts admins and a user\'s decks', async () => {
    expect(await countAdmins(ctx.db)).toBe(1)
    expect(await countUserDecks(ctx.db, 'u2')).toBe(1)
    expect(await countUserDecks(ctx.db, 'u1')).toBe(0)
  })

  it('updates role', async () => {
    await updateUserRole(ctx.db, 'u2', 'admin')
    expect((await getUserForAdmin(ctx.db, 'u2'))!.role).toBe('admin')
    expect(await countAdmins(ctx.db)).toBe(2)
    await updateUserRole(ctx.db, 'u2', 'editor')
  })

  it('sets and clears a ban', async () => {
    const exp = new Date('2030-01-01T00:00:00Z')
    await setUserBan(ctx.db, 'u2', 'rules', exp)
    let d = (await getUserForAdmin(ctx.db, 'u2'))!
    expect(d.banned).toBe(true)
    expect(d.banReason).toBe('rules')
    await clearUserBan(ctx.db, 'u2')
    d = (await getUserForAdmin(ctx.db, 'u2'))!
    expect(d.banned).toBe(false)
    expect(d.banReason).toBeNull()
    expect(d.banExpires).toBeNull()
  })

  it('revokes the banned user\'s sessions, and only theirs', async () => {
    await seedSession('s-u2', 'u2')
    await seedSession('s-u1', 'u1')
    await setUserBan(ctx.db, 'u2', 'rules', null)
    // Better Auth's admin plugin only reads `banned` when a session is created,
    // so leaving the rows behind would let a banned user browse on until they
    // expire. See the comment on setUserBan.
    expect(await sessionIds('u2')).toEqual([])
    expect(await sessionIds('u1')).toEqual(['s-u1'])
    // Unbanning does not resurrect them - the user signs in again.
    await clearUserBan(ctx.db, 'u2')
    expect(await sessionIds('u2')).toEqual([])
    await ctx.db.delete(schema.session).where(eq(schema.session.userId, 'u1'))
  })

  it('deletes a user and cascades their decks', async () => {
    await deleteUserById(ctx.db, 'u2')
    expect(await getUserForAdmin(ctx.db, 'u2')).toBeNull()
    expect(await countUserDecks(ctx.db, 'u2')).toBe(0)
  })
})
