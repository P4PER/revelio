import type { ShowcaseCandidate } from '@revelio/db'
import { mulberry32, shuffle, dayNumber } from './random'

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
  return shuffle(candidates, mulberry32(dayNumber(date))).slice(0, count)
}
