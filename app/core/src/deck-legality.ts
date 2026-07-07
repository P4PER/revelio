import type { DeckFormat, DeckCardMeta, DeckZone } from './deck'

export type DeckEntry = { cardId: string; zone: DeckZone; quantity: number }
export type DeckStatus = 'legal' | 'incomplete' | 'illegal'

export type Violation =
  | { code: 'no_character' }
  | { code: 'multiple_characters' }
  | { code: 'invalid_character'; cardId: string }
  | { code: 'main_deck_size'; actual: number }
  | { code: 'sideboard_too_large'; actual: number }
  | { code: 'too_many_copies'; cardId: string; count: number }
  | { code: 'card_not_in_format'; cardId: string }
  | { code: 'banned_card'; cardId: string }

const HARD: ReadonlySet<Violation['code']> = new Set([
  'multiple_characters', 'invalid_character', 'sideboard_too_large',
  'too_many_copies', 'card_not_in_format', 'banned_card',
])

export function evaluateDeck(
  entries: DeckEntry[],
  format: DeckFormat,
  meta: Record<string, DeckCardMeta>,
): { status: DeckStatus; violations: Violation[] } {
  const violations: Violation[] = []

  const chars = entries.filter((e) => e.zone === 'character')
  if (chars.length === 0) violations.push({ code: 'no_character' })
  if (chars.length > 1) violations.push({ code: 'multiple_characters' })
  for (const c of chars) {
    if (!meta[c.cardId]?.isStartingCharacter) violations.push({ code: 'invalid_character', cardId: c.cardId })
  }

  const mainCount = entries.filter((e) => e.zone === 'main').reduce((n, e) => n + e.quantity, 0)
  if (mainCount !== 60) violations.push({ code: 'main_deck_size', actual: mainCount })

  const sideCount = entries.filter((e) => e.zone === 'sideboard').reduce((n, e) => n + e.quantity, 0)
  if (sideCount > 15) violations.push({ code: 'sideboard_too_large', actual: sideCount })

  // Copy limit: sum main + sideboard per card; lessons exempt.
  const counts = new Map<string, number>()
  for (const e of entries) {
    if (e.zone === 'character') continue
    counts.set(e.cardId, (counts.get(e.cardId) ?? 0) + e.quantity)
  }
  for (const [cardId, count] of counts) {
    if (count > 4 && !meta[cardId]?.isLesson) violations.push({ code: 'too_many_copies', cardId, count })
  }

  // Format legality per distinct card in any zone.
  for (const cardId of new Set(entries.map((e) => e.cardId))) {
    const m = meta[cardId]
    if (!m) continue
    if (format === 'classic' && !m.isOfficial) violations.push({ code: 'card_not_in_format', cardId })
    if (format === 'revival' && m.legality === 'banned') violations.push({ code: 'banned_card', cardId })
  }

  const hasHard = violations.some((v) => HARD.has(v.code))
  const status: DeckStatus = hasHard ? 'illegal' : violations.length > 0 ? 'incomplete' : 'legal'
  return { status, violations }
}
