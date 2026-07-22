import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getSiteSettings, upsertSiteSettings } from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

beforeAll(async () => { ctx = await withMigratedDb() }, 60_000)
afterAll(async () => { await ctx.stop() })

const FULL = {
  operatorName: 'Jane Doe',
  operatorAddress: 'Main St 1\n12345 Town',
  contactEmail: 'hi@revelio.cards',
  hostingProvider: 'Acme VPS (EU)',
  responsiblePerson: null,
  githubUrl: 'https://github.com/P4PER/revelio',
}

describe('site settings queries', () => {
  it('returns null when unset', async () => {
    expect(await getSiteSettings(ctx.db)).toBeNull()
  })

  it('upserts then reads the singleton back', async () => {
    await upsertSiteSettings(ctx.db, FULL)
    const row = await getSiteSettings(ctx.db)
    expect(row).not.toBeNull()
    expect(row!.id).toBe('singleton')
    expect(row!.operatorName).toBe('Jane Doe')
    expect(row!.responsiblePerson).toBeNull()
    expect(row!.githubUrl).toBe('https://github.com/P4PER/revelio')
  })

  it('a second upsert overwrites the same single row and bumps updatedAt', async () => {
    const before = (await getSiteSettings(ctx.db))!.updatedAt.getTime()
    await new Promise((r) => setTimeout(r, 5))
    await upsertSiteSettings(ctx.db, { ...FULL, operatorName: 'John Roe' })
    const rows = await ctx.db.select().from((await import('@revelio/db')).schema.siteSettings)
    expect(rows).toHaveLength(1)
    expect(rows[0].operatorName).toBe('John Roe')
    expect(rows[0].updatedAt.getTime()).toBeGreaterThanOrEqual(before)
  })
})
