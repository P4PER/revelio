import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sets, cards, cardLocalizations, upsertLocalization, getCardIndexData } from '@revelio/db'
import { withMigratedDb } from './helpers'

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(sets).values({ code: 'X', name: 'Xen', isOfficial: true })
  await ctx.db.insert(cards).values({ id: 'x-1', setCode: 'X', number: '1', name: 'Card', defaultLanguage: 'en' })
  await ctx.db.insert(cardLocalizations).values({ cardId: 'x-1', lang: 'en', name: 'Old Name', status: 'official' })
}, 60_000)
afterAll(async () => { await ctx.stop() })

describe('upsertLocalization', () => {
  it('updates an existing localization and stamps origin=user + updatedAt', async () => {
    await upsertLocalization(ctx.db, { cardId: 'x-1', lang: 'en', name: 'New Name', text: 'body', flavorText: null, status: 'official' })
    const rows = await ctx.db.select().from(cardLocalizations)
    const en = rows.find((r) => r.cardId === 'x-1' && r.lang === 'en')!
    expect(en.name).toBe('New Name')
    expect(en.text).toBe('body')
    expect(en.origin).toBe('user')
    expect(en.updatedAt).toBeInstanceOf(Date)
  })

  it('creates a localization for a missing language', async () => {
    await upsertLocalization(ctx.db, { cardId: 'x-1', lang: 'de', name: 'Deutscher Name', text: null, flavorText: null, status: 'machine' })
    const rows = await ctx.db.select().from(cardLocalizations)
    const de = rows.find((r) => r.cardId === 'x-1' && r.lang === 'de')
    expect(de?.name).toBe('Deutscher Name')
    expect(de?.origin).toBe('user')
  })
})

describe('getCardIndexData', () => {
  it('returns the card data shaped for the document builder', async () => {
    const data = await getCardIndexData(ctx.db, 'x-1')
    expect(data?.id).toBe('x-1')
    expect(data?.setName).toBe('Xen')
    expect(data?.isOfficial).toBe(true)
    expect(data?.localizations.en.name).toBe('New Name')
    expect(data?.localizations.de.name).toBe('Deutscher Name')
  })
  it('returns null for an unknown card', async () => {
    expect(await getCardIndexData(ctx.db, 'nope')).toBeNull()
  })
})
