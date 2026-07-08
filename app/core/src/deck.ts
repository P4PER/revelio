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

export type DeckCardMeta = {
  id: string
  isOfficial: boolean
  legality: string | null
  isLesson: boolean
  isStartingCharacter: boolean
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
