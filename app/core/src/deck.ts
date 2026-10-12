import { z } from 'zod'
import { truncateUnits } from './text'

export const DeckFormat = z.enum(['classic', 'revival'])
export const DeckVisibility = z.enum(['private', 'public'])
export const DeckZone = z.enum(['character', 'main', 'sideboard'])
export type DeckFormat = z.infer<typeof DeckFormat>
export type DeckVisibility = z.infer<typeof DeckVisibility>
export type DeckZone = z.infer<typeof DeckZone>

// Slugified sub-type codes that qualify a `character` card as a starting character.
// Source strings 'Witch' / 'Wizard' / 'Wizard/Witch' slugify to these.
export const STARTING_CHARACTER_SUBTYPES = ['witch', 'wizard', 'wizard_witch'] as const

export type DeckCardMeta = {
  id: string
  isOfficial: boolean
  legality: string | null
  isLesson: boolean
  isStartingCharacter: boolean
}

// The longest deck name any writer may store, in UTF-16 units (what zod's
// .max counts). The writer schemas reject past it; duplication, the builder's
// save and import clamp to it, so the deck sheet never has to cut a stored
// name.
export const DECK_NAME_MAX = 120

const COPY_SUFFIX = ' (copy)'

// A name cut to DECK_NAME_MAX, for the paths a maxLength attribute cannot
// reach: an imported name, a stored draft, a deck saved before the bound.
export function clampDeckName(name: string): string {
  return truncateUnits(name, DECK_NAME_MAX)
}

// The name a duplicated deck gets. The base is cut so the suffix still fits
// DECK_NAME_MAX: appending blindly grows a name by seven per copy of a copy,
// and duplication writes past the action's writer schema.
export function copyDeckName(name: string): string {
  return `${truncateUnits(name, DECK_NAME_MAX - COPY_SUFFIX.length)}${COPY_SUFFIX}`.trim()
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
