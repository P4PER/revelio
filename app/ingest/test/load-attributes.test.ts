import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { types, subTypes, lessons } from '@revelio/db'
import { eq } from 'drizzle-orm'
import { loadAttributes } from '../src/load-attributes.js'
import { loadLabels } from '../src/load-labels.js'
import { loadDist } from '../src/load-dist.js'
import { withMigratedDb } from './helpers.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/dataset')
const i18nDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/i18n')

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  const { cards } = await loadDist(fixtureDir)
  await loadAttributes(ctx.db, cards, await loadLabels(i18nDir))
}, 120_000)
afterAll(async () => { await ctx.stop() })

describe('loadAttributes', () => {
  it('derives distinct types from the cards', async () => {
    const rows = await ctx.db.select().from(types)
    const codes = rows.map((r) => r.code).sort()
    expect(codes).toEqual(['character', 'creature', 'match'])
  })

  it('derives sub_types (incl. from cards) with default order', async () => {
    const rows = await ctx.db.select().from(subTypes)
    expect(rows.map((r) => r.code).sort()).toEqual(['gryffindor', 'wizard'])
    expect(rows[0].sortOrder).toBe(999)
  })

  it('applies curated color + order to a lesson derived from provides', async () => {
    const rows = await ctx.db.select().from(lessons).where(eq(lessons.code, 'charms'))
    expect(rows).toHaveLength(1) // Charms comes from Flobberworm.provides
    expect(rows[0].color).toBe('#5B8DEF')
    expect(rows[0].sortOrder).toBe(2)
  })

  it('seeds labels from i18n for a lesson', async () => {
    const rows = await ctx.db.select().from(lessons).where(eq(lessons.code, 'charms'))
    expect(rows).toHaveLength(1)
    expect(rows[0].labels).toEqual({ en: 'Charms', de: 'Zauberkunst' })
  })

  it('seeds labels from i18n for a type', async () => {
    const rows = await ctx.db.select().from(types).where(eq(types.code, 'character'))
    expect(rows).toHaveLength(1)
    expect((rows[0].labels as Record<string, string>).de).toBe('Charakter')
  })

  it('leaves labels empty for sub_types (no i18n config)', async () => {
    const rows = await ctx.db.select().from(subTypes).where(eq(subTypes.code, 'wizard'))
    expect(rows).toHaveLength(1)
    expect(rows[0].labels).toEqual({})
  })

  it('is additive on re-run', async () => {
    const { cards } = await loadDist(fixtureDir)
    await loadAttributes(ctx.db, cards, await loadLabels(i18nDir))
    const rows = await ctx.db.select().from(types)
    expect(rows).toHaveLength(3)
  })
})
