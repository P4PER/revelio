import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { subTypes, getSubTypeLabels, listSubTypesWithTranslations, saveSubTypeTranslations } from '@revelio/db'
import { withMigratedDb } from './helpers.js'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(subTypes).values([{ code: 'wizard' }, { code: 'death_eater' }, { code: 'gryffindor' }])
}, 120_000)
afterAll(async () => { await ctx.stop() })

describe('sub-type translation queries', () => {
  it('saves and reads labels per language', async () => {
    await saveSubTypeTranslations(ctx.db, [
      { code: 'wizard', lang: 'de', label: 'Zauberer' },
      { code: 'death_eater', lang: 'de', label: 'Todesser' },
    ])
    expect(await getSubTypeLabels(ctx.db, 'de')).toEqual({ wizard: 'Zauberer', death_eater: 'Todesser' })
    expect(await getSubTypeLabels(ctx.db, 'en')).toEqual({})
  })

  it('upserts an existing label', async () => {
    await saveSubTypeTranslations(ctx.db, [{ code: 'wizard', lang: 'de', label: 'Magier' }])
    expect((await getSubTypeLabels(ctx.db, 'de')).wizard).toBe('Magier')
  })

  it('deletes on a blank label', async () => {
    await saveSubTypeTranslations(ctx.db, [{ code: 'death_eater', lang: 'de', label: '  ' }])
    expect('death_eater' in (await getSubTypeLabels(ctx.db, 'de'))).toBe(false)
  })

  it('lists every sub-type alphabetically with its labels', async () => {
    const rows = await listSubTypesWithTranslations(ctx.db)
    expect(rows.map((r) => r.code)).toEqual(['death_eater', 'gryffindor', 'wizard'])
    expect(rows.find((r) => r.code === 'wizard')?.labels).toEqual({ de: 'Magier' })
    expect(rows.find((r) => r.code === 'gryffindor')?.labels).toEqual({})
  })
})
