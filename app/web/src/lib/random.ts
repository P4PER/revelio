// mulberry32: small, fast, deterministic PRNG seeded from a 32-bit integer.
// Returns a function yielding floats in [0, 1). Used wherever we need stable,
// reproducible pseudo-randomness (seeded decorative layouts, daily rotations).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MS_PER_DAY = 86_400_000

// UTC calendar-day index for `date` — the shared seed for daily-rotating
// features (example searches, showcase card pick + scatter). Rotates at 00:00 UTC.
export function dayNumber(date: Date): number {
  return Math.floor(date.getTime() / MS_PER_DAY)
}

// Fisher–Yates shuffle driven by a seeded rng; returns a new array, input untouched.
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
