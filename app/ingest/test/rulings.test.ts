import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { sets, cards, cardRulings, cardRulingTexts, saveRulings, getCardById } from '@revelio/db'
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
    const texts = await ctx.db.select().from(cardRulingTexts)
    expect(texts.map((t) => t.text).sort()).toEqual(['first', 'second'])
  })

  it('updates an existing ruling by id and preserves other-language text', async () => {
    const card = await getCardById(ctx.db, 'x-1')
    const first = card!.rulings.find((r) => r.text.en === 'first')!
    // seed a German text on that ruling
    await ctx.db.insert(cardRulingTexts).values({ rulingId: first.id, lang: 'de', text: 'erste' })
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
    const texts = await ctx.db.select().from(cardRulingTexts)
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
    expect(parents.length).toBe(1) // the empty new row was dropped; the kept row stays (has a date)
    const texts = await ctx.db.select().from(cardRulingTexts).where(eq(cardRulingTexts.rulingId, only.id))
    expect(texts.find((t) => t.lang === 'en')).toBeUndefined() // en text removed
  })
})
