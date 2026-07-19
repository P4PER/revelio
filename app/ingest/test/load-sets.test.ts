import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sets } from '@revelio/db'
import { loadSets } from '../src/load-sets.js'
import { withMigratedDb } from './helpers.js'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => { ctx = await withMigratedDb() }, 120_000)
afterAll(async () => { await ctx.stop() })

const sample = [
  { code: 'BS', name: 'Base', releaseDate: '08-2001', isOfficial: true, cardCount: 2, symbol: 'x' },
  { code: 'QC', name: 'Quidditch Cup', releaseDate: '11-2001', isOfficial: true, cardCount: 1, symbol: null },
]

// No asset files exist for these codes, so symbolVersion resolves to null.
const NO_ASSETS = '/tmp/revelio-no-assets'

describe('loadSets', () => {
  it('inserts all sets tagged origin=import', async () => {
    await loadSets(ctx.db, sample, NO_ASSETS)
    const rows = await ctx.db.select().from(sets)
    expect(rows).toHaveLength(2)
    const bs = rows.find((r) => r.code === 'BS')!
    expect(bs.name).toBe('Base')
    expect(bs.origin).toBe('import')
    expect(bs.createdAt).toBeInstanceOf(Date)
  })

  it('re-run never overwrites existing rows (additive)', async () => {
    await loadSets(ctx.db, sample, NO_ASSETS) // self-contained: ensure baseline exists regardless of test order
    await loadSets(ctx.db, [{ ...sample[0], name: 'CHANGED' }, sample[1]], NO_ASSETS)
    const rows = await ctx.db.select().from(sets)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.code === 'BS')?.name).toBe('Base') // preserved, not overwritten
  })
})
