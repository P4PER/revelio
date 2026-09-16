import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { schema, recordTermsAcceptance } from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

async function seedUser(id: string) {
  await ctx.db.insert(schema.user).values({
    id, name: `User ${id}`, email: `${id}@x.test`, emailVerified: true, role: 'user', banned: false,
  })
}

async function acceptance(id: string) {
  const [row] = await ctx.db
    .select({ version: schema.user.termsVersion, at: schema.user.termsAcceptedAt })
    .from(schema.user)
    .where(eq(schema.user.id, id))
  return row
}

beforeAll(async () => {
  ctx = await withMigratedDb()
  await seedUser('a')
  await seedUser('b')
}, 60_000)

afterAll(async () => { await ctx.stop() })

describe('recordTermsAcceptance', () => {
  // Accounts that predate the terms must read as "never accepted", not as a
  // default version nobody was shown.
  it('leaves a new account with no recorded acceptance', async () => {
    expect(await acceptance('a')).toEqual({ version: null, at: null })
  })

  it('stores the version and the moment of acceptance', async () => {
    const at = new Date('2026-09-20T10:00:00Z')
    await recordTermsAcceptance(ctx.db, 'a', '2026-09-16', at)
    expect(await acceptance('a')).toEqual({ version: '2026-09-16', at })
  })

  it('overwrites an earlier acceptance with a later version', async () => {
    const at = new Date('2027-01-05T08:30:00Z')
    await recordTermsAcceptance(ctx.db, 'a', '2027-01-01', at)
    expect(await acceptance('a')).toEqual({ version: '2027-01-01', at })
  })

  it('touches only the given account', async () => {
    expect(await acceptance('b')).toEqual({ version: null, at: null })
  })
})
