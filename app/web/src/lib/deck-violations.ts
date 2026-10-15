import type { Violation } from '@revelio/core'

// The violations that name one card, and so can be shown on that card's row
// in the deck panel. The others (deck size, character count) are deck-wide.
export type RowViolationCode = Extract<Violation, { cardId: string }>['code']

export type ViolationMessage = { key: string; values: Record<string, string | number> }

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
