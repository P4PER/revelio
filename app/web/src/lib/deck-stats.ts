import { evaluateDeck } from '@revelio/core'
import type { DeckCardView, DeckFormat, DeckStatus, Violation } from '@revelio/core'

export type DeckStats = {
  status: DeckStatus
  violations: Violation[]
  mainEntries: DeckCardView[]
  mainCount: number
}

// Mirrors deck-builder.tsx: build the meta map evaluateDeck needs, then derive
// the main-zone entries/count used by the deck overview's stats + legality bar.
export function deckStats(views: DeckCardView[], format: DeckFormat): DeckStats {
  const meta = Object.fromEntries(
    views.map((e) => [
      e.cardId,
      { id: e.cardId, isOfficial: e.isOfficial, legality: e.legality, isLesson: e.isLesson, isStartingCharacter: e.isStartingCharacter },
    ]),
  )
  const { status, violations } = evaluateDeck(
    views.map((e) => ({ cardId: e.cardId, zone: e.zone, quantity: e.quantity })),
    format,
    meta,
  )
  const mainEntries = views.filter((e) => e.zone === 'main')
  const mainCount = mainEntries.reduce((n, e) => n + e.quantity, 0)
  return { status, violations, mainEntries, mainCount }
}
