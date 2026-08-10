import { it, expect } from 'vitest'
import { pickDailyCards } from '../daily-cards'

const pool = Array.from({ length: 20 }, (_, i) => ({ id: `c${i}`, name: `Card ${i}`, imageVersion: 1 }))

it('picks `count` cards, no duplicates', () => {
  const r = pickDailyCards(pool, new Date('2026-08-10T12:00:00Z'), 6)
  expect(r).toHaveLength(6)
  expect(new Set(r.map((c) => c.id)).size).toBe(6)
})

it('is deterministic within a UTC day', () => {
  expect(pickDailyCards(pool, new Date('2026-08-10T00:00:00Z'))).toEqual(
    pickDailyCards(pool, new Date('2026-08-10T23:59:59Z')),
  )
})

it('rotates across consecutive UTC days', () => {
  const a = pickDailyCards(pool, new Date('2026-08-10T12:00:00Z'))
  const b = pickDailyCards(pool, new Date('2026-08-11T12:00:00Z'))
  expect(a).not.toEqual(b)
})

it('returns the whole pool (no dupes) when count exceeds size', () => {
  const r = pickDailyCards(pool, new Date('2026-08-10T12:00:00Z'), 999)
  expect(r).toHaveLength(pool.length)
  expect(new Set(r.map((c) => c.id)).size).toBe(pool.length)
})
