export type VocabEntry = { code: string; sortOrder: number }
export type LessonEntry = VocabEntry & { color: string }

export const TYPES: VocabEntry[] = [
  { code: 'Character', sortOrder: 1 },
  { code: 'Creature', sortOrder: 2 },
  { code: 'Spell', sortOrder: 3 },
  { code: 'Item', sortOrder: 4 },
  { code: 'Lesson', sortOrder: 5 },
  { code: 'Adventure', sortOrder: 6 },
  { code: 'Location', sortOrder: 7 },
  { code: 'Event', sortOrder: 8 },
  { code: 'Match', sortOrder: 9 },
]

// First-pass HP-flavored accent colors on the dark canvas; tunable later.
export const LESSONS: LessonEntry[] = [
  { code: 'Care of Magical Creatures', color: '#5CB878', sortOrder: 1 },
  { code: 'Charms', color: '#5B8DEF', sortOrder: 2 },
  { code: 'Potions', color: '#A06CD5', sortOrder: 3 },
  { code: 'Transfiguration', color: '#E0555B', sortOrder: 4 },
  { code: 'Quidditch', color: '#EA7B3C', sortOrder: 5 },
]

export const RARITIES: VocabEntry[] = [
  { code: 'Common', sortOrder: 1 },
  { code: 'Uncommon', sortOrder: 2 },
  { code: 'Rare', sortOrder: 3 },
  { code: 'Lesson', sortOrder: 4 },
]

export const FINISHES: VocabEntry[] = [
  { code: 'normal', sortOrder: 1 },
  { code: 'foil', sortOrder: 2 },
  { code: 'holo', sortOrder: 3 },
]

export const LEGALITIES: VocabEntry[] = [
  { code: 'legal', sortOrder: 1 },
  { code: 'restricted', sortOrder: 2 },
  { code: 'banned', sortOrder: 3 },
  { code: 'unknown', sortOrder: 4 },
]

// sub_types is intentionally not curated here — it self-extends from card data.
export const VOCAB = {
  types: TYPES,
  lessons: LESSONS,
  rarities: RARITIES,
  finishes: FINISHES,
  legalities: LEGALITIES,
} as const
