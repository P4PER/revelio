import { it, expect } from 'vitest'
import { mulberry32 } from '../random'

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
