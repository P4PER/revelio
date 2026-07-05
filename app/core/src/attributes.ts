export function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export type AttributeMeta = { code: string }
export type LessonMeta = AttributeMeta & { color: string }

// Display order is the array position; keep these in the intended order.
export const TYPES: AttributeMeta[] = [
  { code: 'character' }, { code: 'creature' }, { code: 'spell' }, { code: 'item' },
  { code: 'lesson' }, { code: 'adventure' }, { code: 'location' }, { code: 'event' },
  { code: 'match' },
]

// Mirrors the printed colour of each lesson symbol (see app/web/public/lessons/*.svg)
// so lesson-tinted UI stays consistent with the icons.
export const LESSONS: LessonMeta[] = [
  { code: 'care_of_magical_creatures', color: '#836444' },
  { code: 'charms', color: '#0069A9' },
  { code: 'potions', color: '#00A661' },
  { code: 'transfiguration', color: '#BC3E4D' },
  { code: 'quidditch', color: '#E2AE37' },
]

export const RARITIES: AttributeMeta[] = [
  { code: 'common' }, { code: 'uncommon' }, { code: 'rare' }, { code: 'lesson' },
]

export const FINISHES: AttributeMeta[] = [
  { code: 'normal' }, { code: 'foil' }, { code: 'holo' },
]

export const LEGALITIES: AttributeMeta[] = [
  { code: 'legal' }, { code: 'restricted' }, { code: 'banned' }, { code: 'unknown' },
]

// sub_types is intentionally not curated here — it self-extends from card data.
export const ATTRIBUTES = {
  types: TYPES,
  lessons: LESSONS,
  rarities: RARITIES,
  finishes: FINISHES,
  legalities: LEGALITIES,
} as const
