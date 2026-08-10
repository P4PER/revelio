import { mulberry32 } from './random'

export type ScatterSlot = { left: number; top: number; rot: number }

const MS_PER_DAY = 86_400_000
const EDGE = 6 // keep cards off the exact band edges (percent)
const TOP_MIN = 30 // vertical band the card centers may occupy (percent)
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
  return Array.from({ length: count }, (_, i) => {
    const left = EDGE + i * cell + (0.2 + rng() * 0.6) * cell // jitter within [0.2,0.8] of the cell
    const top = TOP_MIN + rng() * (TOP_MAX - TOP_MIN)
    const rot = (rng() * 2 - 1) * ROT_MAX
    return {
      left: Number(left.toFixed(2)),
      top: Number(top.toFixed(2)),
      rot: Number(rot.toFixed(2)),
    }
  })
}
