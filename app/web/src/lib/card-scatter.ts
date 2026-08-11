import { mulberry32, dayNumber } from './random'

export type ScatterSlot = { left: number; top: number; rot: number }

const EDGE = 6 // keep cards off the exact band edges (percent)
const TOP_MIN = 42 // vertical band the card centers may occupy (percent) — headroom for hover/float
const TOP_MAX = 60
const ROT_MIN = 4 // min tilt (degrees) so no card ever sits perfectly straight
const ROT_MAX = 12 // max tilt (degrees)

/**
 * Deterministic per-day scatter within the showcase band. Splits the usable
 * width into `count` cells and jitters one card inside each, so cards cover the
 * band without horizontal-center collisions. Seed is offset from the card picker
 * so positions don't correlate with which cards were chosen.
 */
export function scatterPositions(date: Date, count: number): ScatterSlot[] {
  const rng = mulberry32((dayNumber(date) ^ 0x9e3779b9) >>> 0)
  const cell = (100 - EDGE * 2) / count
  const halfSpan = (TOP_MAX - TOP_MIN) / 2
  const signs: number[] = []
  return Array.from({ length: count }, (_, i) => {
    const left = EDGE + i * cell + (0.44 + rng() * 0.12) * cell // jitter within [0.44,0.56] of the cell → even spacing, no overlap
    // alternate high / low so neighbours never sit at the same height, with jitter inside each half
    const top =
      i % 2 === 0 ? TOP_MIN + rng() * halfSpan * 0.7 : TOP_MAX - rng() * halfSpan * 0.7
    // random lean + magnitude, but never three in a row leaning the same way,
    // and floored at ROT_MIN so no card sits perfectly straight
    const draw = rng() < 0.5 ? -1 : 1
    const sign = i >= 2 && signs[i - 1] === signs[i - 2] ? -signs[i - 1] : draw
    signs.push(sign)
    const rot = sign * (ROT_MIN + rng() * (ROT_MAX - ROT_MIN))
    return {
      left: Number(left.toFixed(2)),
      top: Number(top.toFixed(2)),
      rot: Number(rot.toFixed(2)),
    }
  })
}
