import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { cards, cardLocalizations, cardTypes, cardSubTypes, cardRulings, cardRulingLocalizations, getCardById } from '@revelio/db'
import { loadSets } from '../src/load-sets.js'
import { loadAttributes } from '../src/load-attributes.js'
import { loadCards } from '../src/load-cards.js'
import { loadDist } from '../src/load-dist.js'
import { withMigratedDb } from './helpers.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const fixtureDir = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures/dataset')

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  const { sets, cards: distCards } = await loadDist(fixtureDir)
  await loadSets(ctx.db, sets)
  await loadAttributes(ctx.db, distCards)
  await loadCards(ctx.db, distCards)
}, 120_000)
afterAll(async () => { await ctx.stop() })

describe('loadCards', () => {
  it('inserts cards with scalar FK values, split stats, and origin=import', async () => {
    const rows = await ctx.db.select().from(cards)
    expect(rows).toHaveLength(3)
    const flobber = rows.find((r) => r.id === 'bs-2-flobberworm')!
    expect(flobber.health).toBe(6)
    expect(flobber.damagePerTurn).toBeNull()
    expect(flobber.cost).toBe(2)
    expect(flobber.rarity).toBe('common')
    expect(flobber.finish).toBe('normal')
    expect(flobber.origin).toBe('import')
  })

  it('links types via the card_types junction', async () => {
    const links = await ctx.db.select().from(cardTypes).where(eq(cardTypes.cardId, 'bs-2-flobberworm'))
    expect(links.map((l) => l.typeCode)).toEqual(['creature'])
  })

  it('links sub_types via the card_sub_types junction', async () => {
    const links = await ctx.db.select().from(cardSubTypes).where(eq(cardSubTypes.cardId, 'bs-1-dean-thomas'))
    expect(links.map((l) => l.subTypeCode).sort()).toEqual(['gryffindor', 'wizard'])
  })

  it('inserts one localization row per language keeping the dist source', async () => {
    const locs = await ctx.db.select().from(cardLocalizations).where(eq(cardLocalizations.cardId, 'bs-1-dean-thomas'))
    expect(locs).toHaveLength(2)
    expect(locs.find((l) => l.lang === 'de')?.text).toBe('Ziehe 3 Karten.')
    expect(locs.find((l) => l.lang === 'en')?.source).toBe('WotC')
  })

  it('inserts card_rulings for flobberworm', async () => {
    const rulings = await ctx.db.select().from(cardRulings).where(eq(cardRulings.cardId, 'bs-2-flobberworm'))
    expect(rulings).toHaveLength(1)
    expect(rulings[0].id).toBe('bs-2-flobberworm-r0')
    expect(rulings[0].seq).toBe(0)
    expect(rulings[0].date).toBe('2001-08-31')
    expect(rulings[0].source).toBe('POJO')
  })

  it('re-run is additive and never overwrites an in-app edit', async () => {
    await ctx.db
      .update(cardLocalizations)
      .set({ text: 'EDITED IN APP' })
      .where(eq(cardLocalizations.cardId, 'bs-1-dean-thomas'))
    const { cards: distCards } = await loadDist(fixtureDir)
    await loadCards(ctx.db, distCards)
    const cardRows = await ctx.db.select().from(cards)
    expect(cardRows).toHaveLength(3)
    const dean = await ctx.db
      .select().from(cardLocalizations)
      .where(eq(cardLocalizations.cardId, 'bs-1-dean-thomas'))
    expect(dean.find((l) => l.lang === 'en')?.text).toBe('EDITED IN APP')
  })
})

describe('rulings (normalized parent + child)', () => {
  it('loads a ruling into card_rulings + card_ruling_texts', async () => {
    const parents = await ctx.db.select().from(cardRulings)
    const flob = parents.find((r) => r.cardId === 'bs-2-flobberworm')!
    expect(flob.id).toBe('bs-2-flobberworm-r0')
    expect(flob.seq).toBe(0)
    expect(flob.date).toBe('2001-08-31')
    expect(flob.source).toBe('POJO')
    const texts = await ctx.db.select().from(cardRulingLocalizations)
    const t = texts.find((x) => x.rulingId === 'bs-2-flobberworm-r0')!
    expect(t.lang).toBe('en')
    expect(t.text).toBe('A ruling.')
  })

  it('getCardById assembles RulingDTO with id + text map', async () => {
    const card = await getCardById(ctx.db, 'bs-2-flobberworm')
    expect(card?.rulings).toEqual([
      { id: 'bs-2-flobberworm-r0', seq: 0, date: '2001-08-31', source: 'POJO', text: { en: 'A ruling.' } },
    ])
  })
})
