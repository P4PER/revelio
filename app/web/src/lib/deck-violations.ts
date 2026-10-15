import type { DeckZone, Violation } from '@revelio/core'

// The violations that name one card, and so can be shown on that card's row
// in the deck panel. The others (deck size, character count) are deck-wide.
export type RowViolationCode = Extract<Violation, { cardId: string }>['code']

export type ViolationMessage = { key: string; values: Record<string, string | number> }

// The zone a jump from the reasons list lands on when a card sits in several:
// the main deck is where a copy-limit fix is usually made. A reason about the
// starting character always goes to the character slot instead.
const JUMP_ORDER: DeckZone[] = ['main', 'sideboard', 'character']

// Message key (under the `decks` namespace) and values for one violation. The
// card id is swapped for the card's name, falling back to the id so a reason
// still reads if the name is somehow missing.
export function violationMessage(v: Violation, names: Record<string, string>): ViolationMessage {
  const { code, ...rest } = v
  if ('cardId' in rest) {
    const { cardId, ...values } = rest
    return { key: `violation.${code}`, values: { ...values, name: names[cardId] ?? cardId } }
  }
  return { key: `violation.${code}`, values: rest }
}

export function rowViolations(violations: Violation[]): Map<string, RowViolationCode[]> {
  const marks = new Map<string, RowViolationCode[]>()
  for (const v of violations) {
    if (!('cardId' in v)) continue
    marks.set(v.cardId, [...(marks.get(v.cardId) ?? []), v.code])
  }
  return marks
}

export function cardNames(entries: { cardId: string; name: string }[]): Record<string, string> {
  return Object.fromEntries(entries.map((e) => [e.cardId, e.name]))
}

export function jumpZone(
  entries: { cardId: string; zone: DeckZone }[],
  cardId: string,
  code: Violation['code'],
): DeckZone | undefined {
  const zones = code === 'invalid_character' ? (['character'] as const) : JUMP_ORDER
  return zones.find((z) => entries.some((e) => e.zone === z && e.cardId === cardId))
}
