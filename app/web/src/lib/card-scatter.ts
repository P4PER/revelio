import { mulberry32 } from './random'

export type ScatterSlot = { left: number; top: number; rot: number }

const MS_PER_DAY = 86_400_000
const EDGE = 6 // keep cards off the exact band edges (percent)
const TOP_MIN = 38 // vertical band the card centers may occupy (percent)
const TOP_MAX = 60
const ROT_MAX = 12 // max tilt (degrees)

/**
 * Deterministic per-day scatter within the showcase band. Splits the usable
 * width into `count` cells and jitters one card inside each, so cards cover the
 * band without horizontal-center collisions. Seed is offset from the card picker
 * so positions don't correlate with which cards were chosen.
 */
export function scatterPositions(date: Date, count: number): ScatterSlot[] {
  const day = Math.floor(date.getTime() / MS_PER_DAY)
  const rng = mulberry32((day ^ 0x9e3779b9) >>> 0)
  const cell = (100 - EDGE * 2) / count
  const halfSpan = (TOP_MAX - TOP_MIN) / 2
  return Array.from({ length: count }, (_, i) => {
    const left = EDGE + i * cell + (0.4 + rng() * 0.2) * cell // jitter within [0.4,0.6] of the cell → even spacing, no overlap
    // alternate high / low so neighbours never sit at the same height, with jitter inside each half
    const top =
      i % 2 === 0 ? TOP_MIN + rng() * halfSpan * 0.7 : TOP_MAX - rng() * halfSpan * 0.7
    const rot = (rng() * 2 - 1) * ROT_MAX
    return {
      left: Number(left.toFixed(2)),
      top: Number(top.toFixed(2)),
      rot: Number(rot.toFixed(2)),
    }
  })
}
