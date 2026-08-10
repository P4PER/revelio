import type { ShowcaseCandidate } from '@revelio/db'
import { mulberry32 } from './random'

const MS_PER_DAY = 86_400_000

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Deterministically pick the day's showcase cards. Depends only on the pool and
 * the UTC calendar day of `date`, so it is stable for all visitors within a day
 * and rotates at 00:00 UTC. Mirrors `pickDailyExamples`.
 */
export function pickDailyCards(
  candidates: readonly ShowcaseCandidate[],
  date: Date,
  count = 6,
): ShowcaseCandidate[] {
  const day = Math.floor(date.getTime() / MS_PER_DAY)
  return shuffle(candidates, mulberry32(day)).slice(0, count)
}
