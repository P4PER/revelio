import type { DeckCardView } from '@revelio/core'

export const OTHER_GROUP = '__other__'

// The main deck is grouped by card type ("main categories"). A card is assigned
// to the first type it carries in this priority order (lesson first, so lesson
// cards always bucket as lessons even if they carry another type).
const TYPE_PRIORITY = ['lesson', 'creature', 'spell', 'item', 'adventure', 'location', 'event', 'match', 'character']

// Display order of the groups. Lessons (the resource base) are pinned to the
// very bottom; everything else follows the canonical type order, then OTHER.
const GROUP_ORDER = ['creature', 'spell', 'item', 'adventure', 'location', 'event', 'match', 'character', OTHER_GROUP, 'lesson']

export function groupKey(e: DeckCardView): string {
  const types = e.types ?? []
  for (const type of TYPE_PRIORITY) if (types.includes(type)) return type
  return OTHER_GROUP
}

// CSS color for a group's marker bar. Lessons (the resource base) get the gold
// accent; every other category uses a neutral theme token.
export function groupColor(key: string): string {
  return key === 'lesson' ? 'var(--primary)' : 'var(--muted-foreground)'
}

// Localized plural label for a group key (the card-type category name).
export function groupLabel(key: string, t: (k: string) => string): string {
  return t(`group.${key === OTHER_GROUP ? 'other' : key}`)
}

// Buckets main-zone entries by type group, ordered by the canonical type order
// (OTHER last), keeping only the groups actually present.
export function groupMainEntries(main: DeckCardView[]): Map<string, DeckCardView[]> {
  const groups = new Map<string, DeckCardView[]>()
  for (const e of main) {
    const key = groupKey(e)
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  const ordered = new Map<string, DeckCardView[]>()
  for (const key of GROUP_ORDER) {
    const list = groups.get(key)
    if (list) ordered.set(key, list)
  }
  return ordered
}
