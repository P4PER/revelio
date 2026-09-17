import { OTHER_GROUP } from '@revelio/core'

// Grouping itself (groupKey, groupMainEntries, OTHER_GROUP) lives in
// core/src/deck-groups.ts, shared with the deck sheet the bot renders. What
// stays here is web-only: a CSS variable and a next-intl lookup.

// CSS color for a group's marker bar. Lessons (the resource base) get the gold
// accent; every other category uses a neutral theme token.
export function groupColor(key: string): string {
  return key === 'lesson' ? 'var(--primary)' : 'var(--muted-foreground)'
}

// Localized plural label for a group key (the card-type category name).
export function groupLabel(key: string, t: (k: string) => string): string {
  return t(`group.${key === OTHER_GROUP ? 'other' : key}`)
}
