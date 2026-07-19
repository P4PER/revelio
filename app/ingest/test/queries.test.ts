import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { getCardById, listSets, getSetByCode, schema } from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>

beforeAll(async () => {
  ctx = await withMigratedDb()
  const { db } = ctx
  await db.insert(schema.types).values({ code: 'creature', labels: {} })
  await db.insert(schema.subTypes).values({ code: 'beast', labels: {} })
  await db.insert(schema.lessons).values({ code: 'charms', labels: {}, color: '#5B8DEF' })
  await db.insert(schema.rarities).values({ code: 'rare', labels: {} })
  await db.insert(schema.sets).values({
    code: 'BS', name: 'Base Set', releaseDate: '2001-01-01', isOfficial: true, cardCount: 1, symbolVersion: 1,
  })
  await db.insert(schema.cards).values({
    id: 'bs-1-fluffy', setCode: 'BS', number: '1', name: 'Fluffy', lesson: 'charms', cost: 3,
    rarity: 'rare', artist: ['Some Artist'], health: 5, damagePerTurn: 2, orientation: 'vertical',
    defaultLanguage: 'en', languages: ['en', 'de'],
  })
  await db.insert(schema.cardTypes).values({ cardId: 'bs-1-fluffy', typeCode: 'creature' })
  await db.insert(schema.cardSubTypes).values({ cardId: 'bs-1-fluffy', subTypeCode: 'beast' })
  await db.insert(schema.cardLocalizations).values([
    { cardId: 'bs-1-fluffy', lang: 'en', name: 'Fluffy', status: 'official', text: 'Guards the trapdoor.', flavorText: 'Woof.' },
    { cardId: 'bs-1-fluffy', lang: 'de', name: 'Fluffy', status: 'machine', text: 'Bewacht die Falltür.', flavorText: null },
  ])
  await db.insert(schema.cardRulings).values({
    id: 'bs-1-fluffy-r1', cardId: 'bs-1-fluffy', seq: 1, date: '2001-06-01', source: 'FAQ',
  })
  await db.insert(schema.cardRulingLocalizations).values({
    rulingId: 'bs-1-fluffy-r1', lang: 'en', text: 'It sleeps to music.',
  })
}, 60_000)

afterAll(async () => { await ctx.stop() })

describe('getCardById', () => {
  it('returns the full detail DTO', async () => {
    const card = await getCardById(ctx.db, 'bs-1-fluffy')
    expect(card).not.toBeNull()
    expect(card!.name).toBe('Fluffy')
    expect(card!.types).toEqual(['creature'])
    expect(card!.subTypes).toEqual(['beast'])
    expect(card!.lesson).toBe('charms')
    expect(card!.artist).toEqual(['Some Artist'])
    expect(card!.health).toBe(5)
    expect(card!.localizations.de.status).toBe('machine')
    expect(card!.localizations.en.text).toBe('Guards the trapdoor.')
    expect(card!.rulings).toHaveLength(1)
    expect(card!.rulings[0].text.en).toBe('It sleeps to music.')
    expect(card!.set.name).toBe('Base Set')
  })

  it('returns null for an unknown id', async () => {
    expect(await getCardById(ctx.db, 'nope')).toBeNull()
  })
})

describe('listSets / getSetByCode', () => {
  it('lists sets and finds one by code', async () => {
    const all = await listSets(ctx.db)
    expect(all.map((s) => s.code)).toContain('BS')
    const bs = await getSetByCode(ctx.db, 'BS')
    expect(bs!.name).toBe('Base Set')
    expect(await getSetByCode(ctx.db, 'ZZ')).toBeNull()
  })
})
