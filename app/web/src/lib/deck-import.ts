import type { DeckCardView, DeckJson, DeckZone, ParsedTextLine } from '@revelio/core'

type CardViewMeta = Omit<DeckCardView, 'zone' | 'quantity'>

// Pure helpers that turn parsed deck data (from @revelio/core's parseJson /
// parseText) plus DB-resolved card view metadata into the BuilderState's
// DeckCardView[] shape. Kept free of React/server-action concerns so they're
// easy to unit test — the import dialog is a thin wrapper around these.

// JSON import: {cardId,quantity} rows already carry a zone by construction
// (character/main/sideboard). Any cardId with no matching view (deleted card,
// bad id, …) is skipped and reported back via `missingIds` instead of being
// silently dropped.
export function jsonToEntries(
  deck: DeckJson,
  views: Record<string, CardViewMeta>,
): { entries: DeckCardView[]; missingIds: string[] } {
  const missing = new Set<string>()
  const entries: DeckCardView[] = []
  const add = (cardId: string, zone: DeckZone, quantity: number) => {
    const meta = views[cardId]
    if (!meta) {
      missing.add(cardId)
      return
    }
    entries.push({ ...meta, zone, quantity })
  }
  if (deck.character) add(deck.character, 'character', 1)
  for (const c of deck.main) add(c.cardId, 'main', c.quantity)
  for (const c of deck.sideboard) add(c.cardId, 'sideboard', c.quantity)
  return { entries, missingIds: [...missing] }
}

// The key resolveCardsByName groups its lookups by — must match @revelio/db's
// `resolveCardsByName` exactly (lowercased name + '|' + setCode, empty string
// when there's no setCode).
export function resolveKey(name: string, setCode: string | null): string {
  return `${name.toLowerCase()}|${setCode ?? ''}`
}

// Text import: parseText doesn't carry zones, so every resolved line becomes
// a main-deck entry. Lines whose name didn't resolve to exactly one card
// (missing or ambiguous — resolveCardsByName maps both to null) or whose
// resolved card has no view metadata are collected into `unresolved` rather
// than dropped. Multiple lines resolving to the same card are merged so the
// builder doesn't end up with duplicate main-deck rows for one cardId.
export function textLinesToEntries(
  lines: ParsedTextLine[],
  resolved: Record<string, string | null>,
  views: Record<string, CardViewMeta>,
): { entries: DeckCardView[]; unresolved: ParsedTextLine[] } {
  const byId = new Map<string, DeckCardView>()
  const unresolved: ParsedTextLine[] = []
  for (const line of lines) {
    const cardId = resolved[resolveKey(line.name, line.setCode)]
    const meta = cardId ? views[cardId] : undefined
    if (!cardId || !meta) {
      unresolved.push(line)
      continue
    }
    const existing = byId.get(cardId)
    if (existing) existing.quantity += line.quantity
    else byId.set(cardId, { ...meta, zone: 'main', quantity: line.quantity })
  }
  return { entries: [...byId.values()], unresolved }
}
