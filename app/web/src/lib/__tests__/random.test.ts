import { it, expect } from 'vitest'
import { mulberry32, shuffle, dayNumber } from '../random'

it('is deterministic: same seed yields the same sequence', () => {
  const a = mulberry32(1337)
  const b = mulberry32(1337)
  const seqA = Array.from({ length: 5 }, () => a())
  const seqB = Array.from({ length: 5 }, () => b())
  expect(seqA).toEqual(seqB)
})

it('yields floats in [0, 1)', () => {
  const rng = mulberry32(42)
  for (let i = 0; i < 100; i++) {
    const n = rng()
    expect(n).toBeGreaterThanOrEqual(0)
    expect(n).toBeLessThan(1)
  }
})

it('different seeds diverge', () => {
  expect(mulberry32(1)()).not.toBe(mulberry32(2)())
})

it('dayNumber gives a stable UTC-day index that rotates at midnight UTC', () => {
  expect(dayNumber(new Date('2026-08-10T00:00:00Z'))).toBe(
    dayNumber(new Date('2026-08-10T23:59:59Z')),
  )
  expect(dayNumber(new Date('2026-08-11T00:00:00Z'))).toBe(
    dayNumber(new Date('2026-08-10T12:00:00Z')) + 1,
  )
})

it('shuffle is a deterministic permutation for a given rng, input untouched', () => {
  const input = [1, 2, 3, 4, 5]
  const a = shuffle(input, mulberry32(7))
  const b = shuffle(input, mulberry32(7))
  expect(a).toEqual(b) // same seed → same order
  expect([...a].sort()).toEqual(input) // permutation, no loss
  expect(input).toEqual([1, 2, 3, 4, 5]) // original not mutated
})
