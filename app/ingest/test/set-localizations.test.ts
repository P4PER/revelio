import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sets, setLocalizations, listSets, getSetByCode, getSetForEdit } from '@revelio/db'
import { withMigratedDb } from './helpers.js'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(sets).values([
    { code: 'BS', name: 'Base', releaseDate: '2001-08-01', isOfficial: true, cardCount: 3 },
    { code: 'QC', name: 'Quidditch Cup', releaseDate: '2001-11-01', isOfficial: true, cardCount: 0 },
  ])
  await ctx.db.insert(setLocalizations).values([
    { setCode: 'BS', lang: 'de', name: 'Grundset' },
  ])
}, 120_000)
afterAll(async () => { await ctx.stop() })

describe('locale-aware set reads', () => {
  it('listSets without a locale returns the base name', async () => {
    const rows = await listSets(ctx.db)
    expect(rows.find((s) => s.code === 'BS')?.name).toBe('Base')
  })

  it('listSets(locale) applies the localization, falling back to base', async () => {
    const rows = await listSets(ctx.db, 'de')
    expect(rows.find((s) => s.code === 'BS')?.name).toBe('Grundset')   // localized
    expect(rows.find((s) => s.code === 'QC')?.name).toBe('Quidditch Cup') // fallback
  })

  it('getSetByCode(locale) applies the localization', async () => {
    expect((await getSetByCode(ctx.db, 'BS', 'de'))?.name).toBe('Grundset')
    expect((await getSetByCode(ctx.db, 'BS', 'en'))?.name).toBe('Base') // no en row -> fallback
    expect((await getSetByCode(ctx.db, 'BS'))?.name).toBe('Base')
  })

  it('getSetByCode matches the code case-insensitively (lowercase URL codes resolve)', async () => {
    const s = await getSetByCode(ctx.db, 'bs', 'de')
    expect(s?.code).toBe('BS') // returns the canonical stored code
    expect(s?.name).toBe('Grundset') // localization still applied
    expect(await getSetByCode(ctx.db, 'nope')).toBeNull()
  })

  it('getSetForEdit returns all localizations keyed by lang', async () => {
    const s = await getSetForEdit(ctx.db, 'BS')
    expect(s).toMatchObject({ code: 'BS', name: 'Base', cardCount: 3, localizations: { de: 'Grundset' } })
    expect(await getSetForEdit(ctx.db, 'NOPE')).toBeNull()
  })
})
