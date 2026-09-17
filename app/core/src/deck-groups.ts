import type { DeckCardView } from './domain'

type Groupable = Pick<DeckCardView, 'types'>

export const OTHER_GROUP = '__other__'

// The main deck is grouped by card type ("main categories"). A card is assigned
// to the first type it carries in this priority order (lesson first, so lesson
// cards always bucket as lessons even if they carry another type).
const TYPE_PRIORITY = ['lesson', 'creature', 'spell', 'item', 'adventure', 'location', 'event', 'match', 'character']

// Display order of the groups. Lessons (the resource base) are pinned to the
// very bottom; everything else follows the canonical type order, then OTHER.
const GROUP_ORDER = ['creature', 'spell', 'item', 'adventure', 'location', 'event', 'match', 'character', OTHER_GROUP, 'lesson']

export function groupKey(e: Groupable): string {
  const types = e.types ?? []
  for (const type of TYPE_PRIORITY) if (types.includes(type)) return type
  return OTHER_GROUP
}

// Buckets main-zone entries by type group, ordered by the canonical type order
// (OTHER last), keeping only the groups actually present. Generic so the deck
// builder's entries and the bot's views both come back as what they went in as.
export function groupMainEntries<T extends Groupable>(main: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const e of main) {
    const key = groupKey(e)
    groups.set(key, [...(groups.get(key) ?? []), e])
  }
  const ordered = new Map<string, T[]>()
  for (const key of GROUP_ORDER) {
    const list = groups.get(key)
    if (list) ordered.set(key, list)
  }
  return ordered
}
