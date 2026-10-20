import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { sets, cards, cardLocalizations, cardRulings, saveCardEdit, getCardById } from '@revelio/db'
import { withMigratedDb } from './helpers'

// Postgres rejects a NUL byte in a text column, so a ruling carrying one fails on the
// server after the localization has been written in the same transaction.
const NUL = String.fromCharCode(0)

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
beforeAll(async () => {
  ctx = await withMigratedDb()
  await ctx.db.insert(sets).values({ code: 'X', name: 'Xen', isOfficial: true })
  await ctx.db.insert(cards).values({ id: 'x-1', setCode: 'X', number: '1', name: 'Card', defaultLanguage: 'en' })
  await ctx.db.insert(cardLocalizations).values({ cardId: 'x-1', lang: 'en', name: 'Old Name', status: 'official' })
}, 60_000)
afterAll(async () => { await ctx.stop() })

const localization = {
  cardId: 'x-1', lang: 'en', name: 'New Name', text: 'body', flavorText: null, status: 'official',
}

async function enName() {
  const [row] = await ctx.db.select().from(cardLocalizations).where(eq(cardLocalizations.cardId, 'x-1'))
  return row.name
}

describe('saveCardEdit', () => {
  it('rolls the localization back when the rulings fail', async () => {
    let caught: unknown
    await saveCardEdit(ctx.db, {
      localization,
      rulings: [{ id: null, date: null, source: null, text: `bad${NUL}` }],
    }).catch((e) => { caught = e })
    expect(caught).toBeInstanceOf(Error)
    expect(await enName()).toBe('Old Name')
    expect(await ctx.db.select().from(cardRulings)).toHaveLength(0)
  })

  it('writes the localization and the rulings together', async () => {
    await saveCardEdit(ctx.db, {
      localization,
      rulings: [{ id: null, date: '2001-08-31', source: 'POJO', text: 'a ruling' }],
    })
    expect(await enName()).toBe('New Name')
    const card = await getCardById(ctx.db, 'x-1')
    expect(card!.rulings.map((r) => r.text.en)).toEqual(['a ruling'])
  })
})
