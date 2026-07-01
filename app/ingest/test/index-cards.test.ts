import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { searchCards, cardsIndex, createMeiliClient } from '@revelio/search'
import { loadSets } from '../src/load-sets.js'
import { loadAttributes } from '../src/load-attributes.js'
import { loadCards } from '../src/load-cards.js'
import { loadDist } from '../src/load-dist.js'
import { loadLabels } from '../src/load-labels.js'
import { indexCards } from '../src/index-cards.js'
import { withMigratedDb } from './helpers.js'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const fixtureDir = resolve(here, 'fixtures/dataset')
const i18nDir = resolve(here, 'fixtures/i18n')

const client = createMeiliClient(
  process.env.TEST_MEILI_HOST ?? 'http://localhost:7700',
  process.env.TEST_MEILI_KEY ?? 'masterKey',
)

let ctx: Awaited<ReturnType<typeof withMigratedDb>>
let langs: string[]
beforeAll(async () => {
  ctx = await withMigratedDb()
  const { sets, cards } = await loadDist(fixtureDir)
  await loadSets(ctx.db, sets)
  await loadAttributes(ctx.db, cards, await loadLabels(i18nDir))
  await loadCards(ctx.db, cards)
  langs = await indexCards(ctx.db, client)
}, 120_000)
afterAll(async () => {
  for (const lang of langs ?? []) await client.deleteIndex(cardsIndex(lang)).catch(() => {})
  await ctx.stop()
})

describe('indexCards', () => {
  it('indexes every language', () => {
    expect(langs.sort()).toEqual(['de', 'en'])
  })

  it('makes cards searchable in the en index', async () => {
    const r = await searchCards(client, 'en', 'dean')
    expect(r.hits.map((h) => h.id)).toContain('bs-1-dean-thomas')
  })

  it('returns the localized name in the de index', async () => {
    const r = await searchCards(client, 'de', 'ziehe')
    expect(r.hits.map((h) => h.id)).toContain('bs-1-dean-thomas')
  })

  it('supports facet filtering after indexing', async () => {
    const r = await searchCards(client, 'en', '', { filters: { types: ['creature'] } })
    expect(r.hits.map((h) => h.id)).toEqual(['bs-2-flobberworm'])
  })
})
