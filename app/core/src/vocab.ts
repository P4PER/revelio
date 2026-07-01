export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export type VocabMeta = { code: string; sortOrder: number }
export type LessonMeta = VocabMeta & { color: string }

export const TYPES: VocabMeta[] = [
  { code: 'character', sortOrder: 1 },
  { code: 'creature', sortOrder: 2 },
  { code: 'spell', sortOrder: 3 },
  { code: 'item', sortOrder: 4 },
  { code: 'lesson', sortOrder: 5 },
  { code: 'adventure', sortOrder: 6 },
  { code: 'location', sortOrder: 7 },
  { code: 'event', sortOrder: 8 },
  { code: 'match', sortOrder: 9 },
]

// First-pass HP-flavored accent colors on the dark canvas; tunable later.
export const LESSONS: LessonMeta[] = [
  { code: 'care_of_magical_creatures', color: '#5CB878', sortOrder: 1 },
  { code: 'charms', color: '#5B8DEF', sortOrder: 2 },
  { code: 'potions', color: '#A06CD5', sortOrder: 3 },
  { code: 'transfiguration', color: '#E0555B', sortOrder: 4 },
  { code: 'quidditch', color: '#EA7B3C', sortOrder: 5 },
]

export const RARITIES: VocabMeta[] = [
  { code: 'common', sortOrder: 1 },
  { code: 'uncommon', sortOrder: 2 },
  { code: 'rare', sortOrder: 3 },
  { code: 'lesson', sortOrder: 4 },
]

export const FINISHES: VocabMeta[] = [
  { code: 'normal', sortOrder: 1 },
  { code: 'foil', sortOrder: 2 },
  { code: 'holo', sortOrder: 3 },
]

export const LEGALITIES: VocabMeta[] = [
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
