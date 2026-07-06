import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { types, subTypes, lessons, rarities } from '@revelio/db'
import { eq } from 'drizzle-orm'
import { loadAttributes } from '../src/load-attributes.js'
import { loadDist } from '../src/load-dist.js'
import { withMigratedDb } from './helpers.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/dataset')

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  const { cards } = await loadDist(fixtureDir)
  await loadAttributes(ctx.db, cards)
}, 120_000)
afterAll(async () => { await ctx.stop() })

describe('loadAttributes', () => {
  it('derives distinct types from the cards', async () => {
    const rows = await ctx.db.select().from(types)
    expect(rows.map((r) => r.code).sort()).toEqual(['character', 'creature', 'match'])
  })

  it('derives sub_types (incl. from cards)', async () => {
    const rows = await ctx.db.select().from(subTypes)
    expect(rows.map((r) => r.code).sort()).toEqual(['gryffindor', 'wizard'])
  })

  it('derives a lesson from provides (codes only, no order)', async () => {
    const rows = await ctx.db.select().from(lessons).where(eq(lessons.code, 'charms'))
    expect(rows).toHaveLength(1) // Charms comes from Flobberworm.provides
  })

  it('applies curated order (array position) to a ranked vocab (rarities)', async () => {
    const rows = await ctx.db.select().from(rarities).where(eq(rarities.code, 'rare'))
    expect(rows).toHaveLength(1)
    expect(rows[0].sortOrder).toBe(3) // rare is the 3rd entry in RARITIES
  })

  it('is additive on re-run', async () => {
    const { cards } = await loadDist(fixtureDir)
    await loadAttributes(ctx.db, cards)
    const rows = await ctx.db.select().from(types)
    expect(rows).toHaveLength(3)
  })
})
