import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  createMeiliClient, cardsIndex, cardNumberSortKey, CARD_INDEX_SETTINGS, type SearchDocument,
} from '@revelio/search'
import type { CardDetailDTO } from '@revelio/core'
import { getCardNeighbors, parseNeighborContext } from '../card-neighbors'

const lang = `test${randomUUID().replace(/-/g, '')}`
const client = createMeiliClient(
  process.env.TEST_MEILI_HOST ?? 'http://localhost:7700',
  process.env.TEST_MEILI_KEY ?? 'masterKey',
)

// Five cards in set BS, numbers 1..5 → deterministic numberSort order a,b,c,d,e.
const docs: SearchDocument[] = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({
  id, setCode: 'BS', number: String(i + 1), numberSort: cardNumberSortKey(String(i + 1)),
  name: id, text: null, flavorText: null, types: [], subTypes: [], lesson: null, rarity: null,
  finishes: [], legality: null, cost: null, damage: null, isOfficial: true,
  imageLang: null, imageVersion: null, artCropVersion: null, defaultLanguage: 'en', orientation: null,
}))

const card = (id: string): CardDetailDTO => ({ id, setCode: 'BS' } as CardDetailDTO)

beforeAll(async () => {
  const s = await client.index(cardsIndex(lang)).updateSettings(CARD_INDEX_SETTINGS)
  await client.waitForTask(s.taskUid)
  const a = await client.index(cardsIndex(lang)).addDocuments(docs, { primaryKey: 'id' })
  await client.waitForTask(a.taskUid)
}, 60_000)
afterAll(async () => { await client.deleteIndex(cardsIndex(lang)) })

describe('getCardNeighbors', () => {
  it('set-order fallback returns numberSort neighbors (no context)', async () => {
    const { prev, next } = await getCardNeighbors(client, lang, card('c'), null)
    expect(prev?.id).toBe('b')
    expect(next?.id).toBe('d')
    expect(prev?.href).toBe('/card/b')
    expect(next?.href).toBe('/card/d')
  })

  it('set-order fallback: first card has no prev', async () => {
    const { prev, next } = await getCardNeighbors(client, lang, card('a'), null)
    expect(prev).toBeNull()
    expect(next?.id).toBe('b')
  })

  it('search-context window walks the sorted result set and forwards context', async () => {
    // sort=number → numberSort:asc → order a,b,c,d,e ; 'c' is absolute index 2
    const ctx = parseNeighborContext(new URLSearchParams('sort=number&i=2'))
    const { prev, next } = await getCardNeighbors(client, lang, card('c'), ctx)
    expect(prev?.id).toBe('b')
    expect(next?.id).toBe('d')
    expect(prev?.href).toBe('/card/b?sort=number&i=1')
    expect(next?.href).toBe('/card/d?sort=number&i=3')
  })

  it('search-context at index 0 has no prev', async () => {
    const ctx = parseNeighborContext(new URLSearchParams('sort=number&i=0'))
    const { prev, next } = await getCardNeighbors(client, lang, card('a'), ctx)
    expect(prev).toBeNull()
    expect(next?.id).toBe('b')
  })

  it('stale index falls back to set order', async () => {
    // center of the window at index 2 is 'c', but we ask about 'a' → stale → fallback
    const ctx = parseNeighborContext(new URLSearchParams('sort=number&i=2'))
    const { prev, next } = await getCardNeighbors(client, lang, card('a'), ctx)
    expect(prev).toBeNull()
    expect(next?.id).toBe('b') // plain set-order href, not context
    expect(next?.href).toBe('/card/b')
  })
})
