import { z } from 'zod'
import { FINISHES } from './attributes'

export const CollectionVisibility = z.enum(['private', 'public'])
export type CollectionVisibility = z.infer<typeof CollectionVisibility>

export type OwnershipFilter = 'owned' | 'missing' | 'dupes'

// cardId -> finish -> quantity owned
export type OwnedQuantities = Record<string, Record<string, number>>

export type SetProgress = { setCode: string; owned: number; total: number }

export type CollectionSummary = {
  distinctOwned: number
  totalCards: number
  totalCopies: number
}

const FINISH_CODES = new Set(FINISHES.map((f) => f.code))

// A finish is writable for a card only if it is a real finish AND that card
// actually offers it (cards.finishes enumerates the ownable variants).
export function isFinishAllowed(cardFinishes: string[], finish: string): boolean {
  return FINISH_CODES.has(finish) && cardFinishes.includes(finish)
}
