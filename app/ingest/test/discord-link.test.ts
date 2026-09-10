import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { schema } from '@revelio/db'
import { getUserIdByDiscordAccount, getLinkedProviderIds } from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

async function seedUser(id: string) {
  await ctx.db.insert(schema.user).values({
    id, name: `User ${id}`, email: `${id}@x.test`, emailVerified: true,
    role: 'user', banned: false,
  })
}

async function seedAccount(id: string, userId: string, providerId: string, accountId: string) {
  await ctx.db.insert(schema.account).values({ id, userId, providerId, accountId })
}

beforeAll(async () => {
  ctx = await withMigratedDb()
  await seedUser('u1')
  await seedUser('u2')
  await seedUser('u3')
  await seedAccount('a1', 'u1', 'discord', '111222333')
  // Same accountId on a different provider: the snowflake namespace is
  // per-provider, so this must not be mistaken for u1's Discord link.
  await seedAccount('a2', 'u3', 'github', '111222333')
}, 60_000)

afterAll(async () => { await ctx.stop() })

describe('getUserIdByDiscordAccount', () => {
  it('resolves a Discord snowflake to the Revelio user id', async () => {
    expect(await getUserIdByDiscordAccount(ctx.db, '111222333')).toBe('u1')
  })

  it('returns null for an unlinked snowflake', async () => {
    expect(await getUserIdByDiscordAccount(ctx.db, '999')).toBeNull()
  })

  it('ignores an account row from another provider with the same accountId', async () => {
    // u3 holds github/111222333; only the discord row may match.
    expect(await getUserIdByDiscordAccount(ctx.db, '111222333')).not.toBe('u3')
  })
})

describe('getLinkedProviderIds', () => {
  it('lists the providers linked to a user', async () => {
    expect(await getLinkedProviderIds(ctx.db, 'u1')).toContain('discord')
  })

  it('returns an empty list for a user with no linked accounts', async () => {
    expect(await getLinkedProviderIds(ctx.db, 'u2')).toEqual([])
  })
})
