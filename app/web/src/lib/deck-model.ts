import type { DeckFormat, DeckZone, DeckCardView } from '@revelio/core'

export type BuilderState = {
  name: string; format: DeckFormat; visibility: 'private' | 'public'; entries: DeckCardView[]
}
const KEY = 'revelio.deck.draft'

export function emptyDeck(): BuilderState {
  return { name: '', format: 'revival', visibility: 'private', entries: [] }
}

function copies(entries: DeckCardView[], cardId: string): number {
  return entries.filter((e) => e.cardId === cardId && e.zone !== 'character').reduce((n, e) => n + e.quantity, 0)
}
export function copyLimitReached(s: BuilderState, cardId: string, isLesson: boolean): boolean {
  return !isLesson && copies(s.entries, cardId) >= 4
}

export function addCard(s: BuilderState, view: Omit<DeckCardView, 'zone' | 'quantity'>, zone: DeckZone): BuilderState {
  if (zone === 'character') {
    const entries = s.entries.filter((e) => e.zone !== 'character')
    return { ...s, entries: [...entries, { ...view, zone, quantity: 1 }] }
  }
  if (copyLimitReached(s, view.cardId, view.isLesson)) return s
  const idx = s.entries.findIndex((e) => e.cardId === view.cardId && e.zone === zone)
  const entries = [...s.entries]
  if (idx >= 0) entries[idx] = { ...entries[idx], quantity: entries[idx].quantity + 1 }
  else entries.push({ ...view, zone, quantity: 1 })
  return { ...s, entries }
}

export function setQuantity(s: BuilderState, cardId: string, zone: DeckZone, qty: number): BuilderState {
  if (qty <= 0) return removeCard(s, cardId, zone)
  return { ...s, entries: s.entries.map((e) => (e.cardId === cardId && e.zone === zone ? { ...e, quantity: qty } : e)) }
}
export function removeCard(s: BuilderState, cardId: string, zone: DeckZone): BuilderState {
  return { ...s, entries: s.entries.filter((e) => !(e.cardId === cardId && e.zone === zone)) }
}
export function setFormat(s: BuilderState, format: DeckFormat): BuilderState { return { ...s, format } }

export function loadDraft(): BuilderState | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as BuilderState } catch { return null }
}
export function saveDraft(s: BuilderState): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(KEY, JSON.stringify(s))
}
export function clearDraft(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(KEY)
}
