import { it, expect } from 'vitest'
import { pickDailyExamples } from '../daily-examples'

const noon = new Date('2026-08-06T12:00:00Z')

it('returns 5 distinct terms by default', () => {
  const r = pickDailyExamples('en', noon)
  expect(r).toHaveLength(5)
  expect(new Set(r).size).toBe(5)
})

it('is deterministic for the same locale and UTC day', () => {
  expect(pickDailyExamples('en', new Date('2026-08-06T00:00:00Z'))).toEqual(
    pickDailyExamples('en', new Date('2026-08-06T23:59:59Z')),
  )
})

it('rotates across consecutive UTC days', () => {
  const a = pickDailyExamples('en', new Date('2026-08-06T12:00:00Z'))
  const b = pickDailyExamples('en', new Date('2026-08-07T12:00:00Z'))
  expect(a).not.toEqual(b)
})

it('falls back to the en pool for unknown locales', () => {
  expect(pickDailyExamples('xx', noon)).toEqual(pickDailyExamples('en', noon))
})

it('returns the whole pool with no dupes when count exceeds pool size', () => {
  const r = pickDailyExamples('en', noon, 999)
  expect(new Set(r).size).toBe(r.length)
  expect(r.length).toBeGreaterThan(5)
})

it('serves locale-specific terms for de', () => {
  const de = pickDailyExamples('de', noon, 999)
  expect(de).toContain('Schnatz')
})
