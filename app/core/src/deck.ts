import { z } from 'zod'

export const DeckFormat = z.enum(['classic', 'revival'])
export const DeckVisibility = z.enum(['private', 'public'])
export const DeckZone = z.enum(['character', 'main', 'sideboard'])
export type DeckFormat = z.infer<typeof DeckFormat>
export type DeckVisibility = z.infer<typeof DeckVisibility>
export type DeckZone = z.infer<typeof DeckZone>

// Slugified sub-type codes that qualify a `character` card as a starting character.
// Source strings 'Witch' / 'Wizard' / 'Wizard/Witch' slugify to these.
export const STARTING_CHARACTER_SUBTYPES = ['witch', 'wizard', 'wizard_witch'] as const

// The longest deck name any writer may store, in UTF-16 units (what zod's
// .max counts). Every write path holds to it, duplication included, so the
// deck sheet's carry bound is never reached by a stored name.
export const DECK_NAME_MAX = 120

const COPY_SUFFIX = ' (copy)'

export type DeckCardMeta = {
  id: string
  isOfficial: boolean
  legality: string | null
  isLesson: boolean
  isStartingCharacter: boolean
}

// The name a duplicated deck gets. The base is cut so the suffix still fits
// DECK_NAME_MAX: appending blindly grows a name by seven per copy of a copy,
// and duplication writes past the action's writer schema.
export function copyDeckName(name: string): string {
  const base = name
    .slice(0, DECK_NAME_MAX - COPY_SUFFIX.length)
    // A cut by string unit can halve a surrogate pair.
    .replace(/[\uD800-\uDBFF]$/u, '')
    .trimEnd()
  return `${base}${COPY_SUFFIX}`
}

export function deckCardMeta(c: {
  id: string
  isOfficial: boolean
  legality: string | null
  types: string[]
  subTypes: string[]
}): DeckCardMeta {
  const isLesson = c.types.includes('lesson')
  const isStartingCharacter =
    c.types.includes('character') &&
    c.subTypes.some((s) => (STARTING_CHARACTER_SUBTYPES as readonly string[]).includes(s))
  return { id: c.id, isOfficial: c.isOfficial, legality: c.legality, isLesson, isStartingCharacter }
}
