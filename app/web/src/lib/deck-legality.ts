import type { DeckStatus } from '@revelio/core'

// The main deck must reach this many cards to be tournament-legal.
export const MAIN_TARGET = 60

// Tailwind classes per legality status, shared by the seal (deck overview) and
// the deck panel's progress bar (builder) so both read the same color language.
export const STATUS_UI: Record<DeckStatus, { fill: string; dot: string; text: string }> = {
  legal: { fill: 'bg-chart-4', dot: 'bg-chart-4', text: 'text-chart-4' },
  incomplete: { fill: 'bg-primary', dot: 'bg-primary', text: 'text-primary' },
  illegal: { fill: 'bg-destructive', dot: 'bg-destructive', text: 'text-destructive' },
}

// Human-readable legality summary. While `incomplete`, it points at the most
// useful next step: fill the main deck if it's short, otherwise flag a missing
// starting character, otherwise a generic "incomplete".
export function deckStatusText(
  status: DeckStatus,
  mainCount: number,
  hasCharacter: boolean,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (status === 'legal') return t('status.legal')
  if (status === 'illegal') return t('status.illegal')
  if (mainCount < MAIN_TARGET) return t('status.incompleteNeeds', { count: MAIN_TARGET - mainCount })
  if (mainCount > MAIN_TARGET) return t('status.tooMany', { count: mainCount - MAIN_TARGET })
  if (!hasCharacter) return t('status.needsCharacter')
  return t('status.incomplete')
}
