import { mulberry32 } from './random'

// Curated example-search terms per locale. These double as functional search
// queries (rendered as chips linking to /search?q=...), so they live here as
// typed data rather than in messages/*.json. Every term should return results
// in its locale's search index.
const POOLS: Record<string, string[]> = {
  en: [
    'Harry Potter',
    'Dumbledore',
    'Hermione',
    'Ron Weasley',
    'Snape',
    'Hagrid',
    'Draco Malfoy',
    'Voldemort',
    'Quidditch',
    'Snitch',
    'Charms',
    'Transfiguration',
    'Potions',
    'Broom',
    'Wand',
    'Dragon',
    'Troll',
    'Owl',
  ],
  de: [
    'Harry Potter',
    'Dumbledore',
    'Hermine',
    'Ron Weasley',
    'Snape',
    'Hagrid',
    'Draco Malfoy',
    'Voldemort',
    'Quidditch',
    'Schnatz',
    'Zauberkunst',
    'Verwandlung',
    'Zaubertränke',
    'Besen',
    'Zauberstab',
    'Drache',
    'Troll',
    'Eule',
  ],
}

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
 * Pick the example searches for a given locale and day. Deterministic: the
 * result depends only on the locale and the UTC calendar day of `date`, so it
 * is stable within a day for all visitors and rotates at 00:00 UTC.
 */
export function pickDailyExamples(locale: string, date: Date, count = 5): string[] {
  const pool = POOLS[locale] ?? POOLS.en
  const day = Math.floor(date.getTime() / MS_PER_DAY)
  return shuffle(pool, mulberry32(day)).slice(0, count)
}
