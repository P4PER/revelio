export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export type AttributeMeta = { code: string; sortOrder: number }
export type LessonMeta = AttributeMeta & { color: string }

export const TYPES: AttributeMeta[] = [
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

// Mirrors the printed colour of each lesson symbol (see app/web/public/lessons/*.svg)
// so lesson-tinted UI stays consistent with the icons.
export const LESSONS: LessonMeta[] = [
  { code: 'care_of_magical_creatures', color: '#836444', sortOrder: 1 },
  { code: 'charms', color: '#0069A9', sortOrder: 2 },
  { code: 'potions', color: '#00A661', sortOrder: 3 },
  { code: 'transfiguration', color: '#BC3E4D', sortOrder: 4 },
  { code: 'quidditch', color: '#E2AE37', sortOrder: 5 },
]

export const RARITIES: AttributeMeta[] = [
  { code: 'common', sortOrder: 1 },
  { code: 'uncommon', sortOrder: 2 },
  { code: 'rare', sortOrder: 3 },
  { code: 'lesson', sortOrder: 4 },
]

export const FINISHES: AttributeMeta[] = [
  { code: 'normal', sortOrder: 1 },
  { code: 'foil', sortOrder: 2 },
  { code: 'holo', sortOrder: 3 },
]

export const LEGALITIES: AttributeMeta[] = [
  { code: 'legal', sortOrder: 1 },
  { code: 'restricted', sortOrder: 2 },
  { code: 'banned', sortOrder: 3 },
  { code: 'unknown', sortOrder: 4 },
]

// sub_types is intentionally not curated here — it self-extends from card data.
export const ATTRIBUTES = {
  types: TYPES,
  lessons: LESSONS,
  rarities: RARITIES,
  finishes: FINISHES,
  legalities: LEGALITIES,
} as const
