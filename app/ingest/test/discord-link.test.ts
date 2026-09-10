import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { schema } from '@revelio/db'
import { getUserIdByDiscordAccount, getLinkedProviderIds, unlinkProvider, getUserExport } from '@revelio/db'
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

describe('getUserExport connections', () => {
  it('carries the linked account, since the policy calls it stored personal data', async () => {
    await seedUser('u8')
    await ctx.db.insert(schema.account).values({
      id: 'a8', userId: 'u8', providerId: 'discord', accountId: '123123123',
      accessToken: 'secret-access', refreshToken: 'secret-refresh', scope: 'identify,email',
    })
    const dump = await getUserExport(ctx.db, 'u8')
    expect(dump.connections).toEqual([
      { provider: 'discord', accountId: '123123123', linkedAt: expect.any(String) },
    ])
    // Tokens are credentials for reaching Discord, not facts about the user -
    // a downloaded export must not become a way to leak them.
    expect(JSON.stringify(dump)).not.toContain('secret-access')
    expect(JSON.stringify(dump)).not.toContain('secret-refresh')
  })

  it('is an empty list for a user who linked nothing', async () => {
    expect((await getUserExport(ctx.db, 'u2')).connections).toEqual([])
  })
})

describe('unlinkProvider', () => {
  it('removes only the calling user\'s row for that provider', async () => {
    await seedUser('u9')
    await seedAccount('a9d', 'u9', 'discord', '444555666')
    await seedAccount('a9g', 'u9', 'github', '777888999')

    expect(await unlinkProvider(ctx.db, 'u9', 'discord')).toBe(1)
    expect(await getUserIdByDiscordAccount(ctx.db, '444555666')).toBeNull()
    // The user's other provider survives, and so does u1's discord link.
    expect(await getLinkedProviderIds(ctx.db, 'u9')).toEqual(['github'])
    expect(await getUserIdByDiscordAccount(ctx.db, '111222333')).toBe('u1')
  })

  it('reports nothing removed when the provider was never linked', async () => {
    expect(await unlinkProvider(ctx.db, 'u2', 'discord')).toBe(0)
  })

  // The action resolves userId from the session, but the query is the last line
  // of defence: it must never reach across users.
  it('cannot remove another user\'s link', async () => {
    expect(await unlinkProvider(ctx.db, 'u2', 'discord')).toBe(0)
    expect(await getUserIdByDiscordAccount(ctx.db, '111222333')).toBe('u1')
  })
})
