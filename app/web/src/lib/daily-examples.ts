import { mulberry32, shuffle, dayNumber } from './random'

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
    'Neville Longbottom',
    'Sirius Black',
    'Lupin',
    'McGonagall',
    'Ginny Weasley',
    'Dobby',
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
    'Basilisk',
    'Hippogriff',
    'Phoenix',
    'Unicorn',
    'Dementor',
    'Hedwig',
    'Hogwarts',
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
    'Neville Longbottom',
    'Sirius Black',
    'Lupin',
    'McGonagall',
    'Ginny Weasley',
    'Dobby',
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
    'Basilisk',
    'Hippogreif',
    'Phönix',
    'Einhorn',
    'Dementor',
    'Hedwig',
    'Hogwarts',
  ],
}

/**
 * Pick the example searches for a given locale and day. Deterministic: the
 * result depends only on the locale and the UTC calendar day of `date`, so it
 * is stable within a day for all visitors and rotates at 00:00 UTC.
 */
export function pickDailyExamples(locale: string, date: Date, count = 5): string[] {
  const pool = POOLS[locale] ?? POOLS.en
  return shuffle(pool, mulberry32(dayNumber(date))).slice(0, count)
}
