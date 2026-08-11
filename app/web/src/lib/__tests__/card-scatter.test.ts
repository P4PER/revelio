import { it, expect } from 'vitest'
import { scatterPositions } from '../card-scatter'

const day = new Date('2026-08-10T12:00:00Z')

it('returns one slot per requested card', () => {
  expect(scatterPositions(day, 6)).toHaveLength(6)
})

it('is deterministic within a UTC day and rotates across days', () => {
  expect(scatterPositions(new Date('2026-08-10T01:00:00Z'), 6)).toEqual(
    scatterPositions(new Date('2026-08-10T22:00:00Z'), 6),
  )
  expect(scatterPositions(day, 6)).not.toEqual(scatterPositions(new Date('2026-08-11T12:00:00Z'), 6))
})

it('never leans three cards in a row the same way, and none sit straight', () => {
  const rots = scatterPositions(day, 6).map((s) => s.rot)
  for (const r of rots) expect(Math.abs(r)).toBeGreaterThanOrEqual(4) // never straight
  for (let i = 2; i < rots.length; i++) {
    const run = Math.sign(rots[i]) === Math.sign(rots[i - 1]) && Math.sign(rots[i - 1]) === Math.sign(rots[i - 2])
    expect(run).toBe(false) // no run of three same-direction tilts
  }
})

it('keeps every slot in bounds', () => {
  for (const s of scatterPositions(day, 6)) {
    expect(s.left).toBeGreaterThanOrEqual(0)
    expect(s.left).toBeLessThanOrEqual(100)
    expect(s.top).toBeGreaterThanOrEqual(0)
    expect(s.top).toBeLessThanOrEqual(100)
    expect(Math.abs(s.rot)).toBeLessThanOrEqual(12)
  }
})

it('lays cards left-to-right with no horizontal collisions', () => {
  const lefts = scatterPositions(day, 6).map((s) => s.left)
  const sorted = [...lefts].sort((a, b) => a - b)
  expect(lefts).toEqual(sorted)
  for (let i = 1; i < lefts.length; i++) expect(lefts[i] - lefts[i - 1]).toBeGreaterThan(0)
})
