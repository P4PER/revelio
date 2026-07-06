import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sets, setLocalizations, createSet, updateSet, deleteSet, setSymbolFile, getSetForEdit } from '@revelio/db'
import { eq } from 'drizzle-orm'
import { withMigratedDb } from './helpers.js'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => { ctx = await withMigratedDb() }, 120_000)
afterAll(async () => { await ctx.stop() })

describe('set write queries', () => {
  it('createSet inserts the set (origin user) and its non-blank localizations', async () => {
    await createSet(ctx.db, 'BS', {
      name: 'Base', releaseDate: '2001-08-01', isOfficial: true,
      localizations: { de: 'Grundset', en: '  ' }, // blank en is skipped
    })
    const s = await getSetForEdit(ctx.db, 'BS')
    expect(s).toMatchObject({ code: 'BS', name: 'Base', isOfficial: true, localizations: { de: 'Grundset' } })
    const [row] = await ctx.db.select().from(sets).where(eq(sets.code, 'BS'))
    expect(row.origin).toBe('user')
  })

  it('updateSet changes fields, upserts a localization, and deletes a blanked one', async () => {
    await updateSet(ctx.db, 'BS', {
      name: 'Base Set', releaseDate: '2001-09-01', isOfficial: false,
      localizations: { de: '', fr: 'Base FR' }, // de blank -> delete, fr new -> insert
    })
    const s = await getSetForEdit(ctx.db, 'BS')
    expect(s).toMatchObject({ name: 'Base Set', isOfficial: false, localizations: { fr: 'Base FR' } })
    expect('de' in (s!.localizations)).toBe(false)
  })

  it('setSymbolFile sets and clears the symbol', async () => {
    await setSymbolFile(ctx.db, 'BS', 'logo.png')
    expect((await getSetForEdit(ctx.db, 'BS'))?.symbol).toBe('logo.png')
    await setSymbolFile(ctx.db, 'BS', null)
    expect((await getSetForEdit(ctx.db, 'BS'))?.symbol).toBeNull()
  })

  it('deleteSet removes the set and cascades its localizations', async () => {
    await deleteSet(ctx.db, 'BS')
    expect(await getSetForEdit(ctx.db, 'BS')).toBeNull()
    const locs = await ctx.db.select().from(setLocalizations).where(eq(setLocalizations.setCode, 'BS'))
    expect(locs).toHaveLength(0)
  })
})
