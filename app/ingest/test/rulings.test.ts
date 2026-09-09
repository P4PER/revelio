import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { sets, cards, cardRulings, cardRulingLocalizations, saveRulings, getCardById, getCardRulings } from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(sets).values({ code: 'X', name: 'Xen', isOfficial: true })
  await ctx.db.insert(cards).values({ id: 'x-1', setCode: 'X', number: '1', name: 'Card', defaultLanguage: 'en' })
}, 60_000)
afterAll(async () => { await ctx.stop() })

describe('saveRulings', () => {
  it('inserts new rulings with seq by order, origin=user, and the active-language text', async () => {
    await saveRulings(ctx.db, 'x-1', 'en', [
      { id: null, date: '2001-08-31', source: 'POJO', text: 'first' },
      { id: null, date: null, source: null, text: 'second' },
    ])
    const parents = await ctx.db.select().from(cardRulings).where(eq(cardRulings.cardId, 'x-1'))
    expect(parents.length).toBe(2)
    expect(parents.every((p) => p.origin === 'user')).toBe(true)
    expect(parents.map((p) => p.seq).sort()).toEqual([0, 1])
    const texts = await ctx.db.select().from(cardRulingLocalizations)
    expect(texts.map((t) => t.text).sort()).toEqual(['first', 'second'])
  })

  it('updates an existing ruling by id and preserves other-language text', async () => {
    const card = await getCardById(ctx.db, 'x-1')
    const first = card!.rulings.find((r) => r.text.en === 'first')!
    // seed a German text on that ruling
    await ctx.db.insert(cardRulingLocalizations).values({ rulingId: first.id, lang: 'de', text: 'erste' })
    // edit only the English text, keep both rulings
    const rows = card!.rulings.map((r) => ({ id: r.id, date: r.date, source: r.source, text: r.text.en === 'first' ? 'FIRST' : r.text.en ?? '' }))
    await saveRulings(ctx.db, 'x-1', 'en', rows)
    const after = await getCardById(ctx.db, 'x-1')
    const edited = after!.rulings.find((r) => r.id === first.id)!
    expect(edited.text).toEqual({ en: 'FIRST', de: 'erste' })
  })

  it('deletes rulings removed from the list (cascade drops their texts)', async () => {
    const card = await getCardById(ctx.db, 'x-1')
    const keep = card!.rulings.find((r) => r.text.en === 'second')!
    await saveRulings(ctx.db, 'x-1', 'en', [{ id: keep.id, date: keep.date, source: keep.source, text: keep.text.en ?? '' }])
    const parents = await ctx.db.select().from(cardRulings).where(eq(cardRulings.cardId, 'x-1'))
    expect(parents.length).toBe(1)
    const texts = await ctx.db.select().from(cardRulingLocalizations)
    // only the kept ruling's texts remain (the deleted ruling's en+de are gone)
    expect(texts.every((t) => t.rulingId === keep.id)).toBe(true)
  })

  it('drops fully-empty rows and deletes an emptied language text', async () => {
    const card = await getCardById(ctx.db, 'x-1')
    const only = card!.rulings[0]
    await saveRulings(ctx.db, 'x-1', 'en', [
      { id: only.id, date: only.date, source: only.source, text: '' }, // empties the en text
      { id: null, date: '', source: '', text: '' }, // fully-empty new row -> dropped
    ])
    const parents = await ctx.db.select().from(cardRulings).where(eq(cardRulings.cardId, 'x-1'))
    expect(parents.length).toBe(1) // the empty new row was dropped; the existing ruling stays (id preserved regardless of empty fields)
    const texts = await ctx.db.select().from(cardRulingLocalizations).where(eq(cardRulingLocalizations.rulingId, only.id))
    expect(texts.find((t) => t.lang === 'en')).toBeUndefined() // en text removed
  })
})

describe('getCardRulings', () => {
  beforeAll(async () => {
    await ctx.db.insert(cards).values([
      { id: 'x-2', setCode: 'X', number: '2', name: 'Second', defaultLanguage: 'en' },
      { id: 'x-3', setCode: 'X', number: '3', name: 'Third', defaultLanguage: 'de' },
    ])
    // inserted out of seq order, so the ordering assertion means something
    await ctx.db.insert(cardRulings).values([
      { id: 'r-b', cardId: 'x-2', seq: 1 },
      { id: 'r-a', cardId: 'x-2', seq: 0, date: '2001-08-31', source: 'WotC' },
    ])
    await ctx.db.insert(cardRulingLocalizations).values([
      { rulingId: 'r-a', lang: 'en', text: 'first en' },
      { rulingId: 'r-a', lang: 'de', text: 'erste de' },
      { rulingId: 'r-b', lang: 'en', text: 'second en' },
    ])
  })

  it('returns rulings ordered by seq, each with every language text', async () => {
    const res = await getCardRulings(ctx.db, 'x-2')
    expect(res!.defaultLanguage).toBe('en')
    expect(res!.rulings.map((r) => r.id)).toEqual(['r-a', 'r-b'])
    expect(res!.rulings[0]).toMatchObject({
      seq: 0, date: '2001-08-31', source: 'WotC', text: { en: 'first en', de: 'erste de' },
    })
    expect(res!.rulings[1]).toMatchObject({ seq: 1, date: null, source: null, text: { en: 'second en' } })
  })

  it('returns an empty list for a card with no rulings', async () => {
    expect(await getCardRulings(ctx.db, 'x-3')).toEqual({ defaultLanguage: 'de', rulings: [] })
  })

  it('returns null for a card that does not exist', async () => {
    expect(await getCardRulings(ctx.db, 'nope')).toBeNull()
  })

  it('agrees with what getCardById assembles', async () => {
    const full = await getCardById(ctx.db, 'x-2')
    const only = await getCardRulings(ctx.db, 'x-2')
    expect(only!.rulings).toEqual(full!.rulings)
    expect(only!.defaultLanguage).toBe(full!.defaultLanguage)
  })
})
