import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { types, subTypes, lessons } from '@revelio/db'
import { eq } from 'drizzle-orm'
import { loadVocab } from '../src/load-vocab.js'
import { loadDist } from '../src/load-dist.js'
import { withMigratedDb } from './helpers.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/dataset')

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  const { cards } = await loadDist(fixtureDir)
  await loadVocab(ctx.db, cards)
}, 120_000)
afterAll(async () => { await ctx.stop() })

describe('loadVocab', () => {
  it('derives distinct types from the cards', async () => {
    const rows = await ctx.db.select().from(types)
    const codes = rows.map((r) => r.code).sort()
    expect(codes).toEqual(['Character', 'Creature', 'Match'])
  })

  it('derives sub_types (incl. from cards) with default order', async () => {
    const rows = await ctx.db.select().from(subTypes)
    expect(rows.map((r) => r.code).sort()).toEqual(['Gryffindor', 'Wizard'])
    expect(rows[0].sortOrder).toBe(999)
  })

  it('applies curated color + order to a lesson derived from provides', async () => {
    const rows = await ctx.db.select().from(lessons).where(eq(lessons.code, 'Charms'))
    expect(rows).toHaveLength(1) // Charms comes from Flobberworm.provides
    expect(rows[0].color).toBe('#5B8DEF')
    expect(rows[0].sortOrder).toBe(2)
  })

  it('is additive on re-run', async () => {
    const { cards } = await loadDist(fixtureDir)
    await loadVocab(ctx.db, cards)
    const rows = await ctx.db.select().from(types)
    expect(rows).toHaveLength(3)
  })
})
