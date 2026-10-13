import {
  getDeckAccess,
  getDeckForViewer,
  suggestDecks,
  type DB,
  type DeckSuggestion,
} from '@revelio/db'
import {
  evaluateDeck,
  type DeckCardMeta,
  type DeckCardView,
  type DeckFormat,
  type DeckStatus,
} from '@revelio/core'
import { t } from '../i18n/t'
import { clampLabel, MAX_CHOICES } from './cards'

export type DeckEntryView = {
  name: string
  quantity: number
  cost: number | null
  lesson: string | null
  // The printing, for the list view's "(BS 75)". Both are '' when getDeck could
  // not resolve the card row, so a consumer has to treat empty as absent.
  setCode: string
  number: string
}

export type DeckView = {
  id: string
  name: string
  format: DeckFormat
  ownerUsername: string | null
  character: DeckEntryView | null
  main: DeckEntryView[]
  sideboard: DeckEntryView[]
  // Every view in sheet order - character, then main, then sideboard, each zone
  // by cost then name - for the shared deck sheet layout the image is drawn from.
  entries: DeckCardView[]
  mainCount: number
  sideboardCount: number
  topLesson: string | null
  status: DeckStatus
}

// What /deck was asked for, once the input has been read. A picked suggestion
// always arrives as an id, so it lands on 'deck'; only typed free text can be
// 'ambiguous'.
export type DeckRef =
  | { kind: 'deck'; id: string; name: string; access: 'public' | 'own-private' }
  | { kind: 'ambiguous'; options: DeckSuggestion[] }
  | { kind: 'none' }

type Sortable = Pick<DeckCardView, 'cost' | 'name'>

function byCostThenName(a: Sortable, b: Sortable): number {
  const ac = a.cost ?? Number.MAX_SAFE_INTEGER
  const bc = b.cost ?? Number.MAX_SAFE_INTEGER
  return ac !== bc ? ac - bc : a.name.localeCompare(b.name)
}

// People paste links, not ids. Take the segment after /decks/ when there is one,
// otherwise treat the whole input as an id. No shape validation: an unknown id
// is already a lookup miss with its own reply, and guessing the id format would
// break the day that format changes.
export function parseDeckRef(input: string): string {
  const trimmed = input.trim()
  const match = /\/decks\/([^/?#]+)/.exec(trimmed)
  if (match) return match[1]
  return trimmed.replace(/[/?#].*$/, '')
}

// The viewer decides what is visible: null sees public decks only, an owner
// also sees their own private ones. getDeckForViewer is what enforces that;
// never call getDeck directly.
export async function getDeckView(db: DB, ref: string, viewerId: string | null): Promise<DeckView | null> {
  const res = await getDeckForViewer(db, parseDeckRef(ref), viewerId)
  if (!res) return null
  const { deck, views, ownerUsername } = res

  const toEntry = (v: (typeof views)[number]): DeckEntryView => ({
    name: v.name, quantity: v.quantity, cost: v.cost, lesson: v.lesson,
    setCode: v.setCode, number: v.number,
  })
  const zone = (name: string) => views.filter((v) => v.zone === name).sort(byCostThenName)
  const mainViews = zone('main')
  const sideboardViews = zone('sideboard')
  const character = views.find((v) => v.zone === 'character')
  const entries = [...(character ? [character] : []), ...mainViews, ...sideboardViews]
  const main = mainViews.map(toEntry)
  const sideboard = sideboardViews.map(toEntry)

  const copies = (list: DeckEntryView[]) => list.reduce((n, c) => n + c.quantity, 0)

  // Most-used lesson by copies, for the embed's accent colour.
  const lessonCopies = new Map<string, number>()
  for (const v of views) {
    if (!v.lesson) continue
    lessonCopies.set(v.lesson, (lessonCopies.get(v.lesson) ?? 0) + v.quantity)
  }
  // Tie broken by lesson code, not by row order: deck_cards is read without an
  // ORDER BY, so leaving a tie to arrival order would let the accent colour flip
  // between two identical lookups of the same deck.
  const topLesson = [...lessonCopies.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null

  // DeckCardView already carries every field DeckCardMeta needs, so legality
  // reuses the same evaluator the deck builder runs - the two can never disagree.
  const meta: Record<string, DeckCardMeta> = {}
  for (const v of views) {
    meta[v.cardId] = {
      id: v.cardId,
      isOfficial: v.isOfficial,
      legality: v.legality,
      isLesson: v.isLesson,
      isStartingCharacter: v.isStartingCharacter,
    }
  }
  const { status } = evaluateDeck(
    views.map((v) => ({ cardId: v.cardId, zone: v.zone, quantity: v.quantity })),
    deck.format,
    meta,
  )

  return {
    id: deck.id,
    name: deck.name,
    format: deck.format,
    ownerUsername,
    character: character ? toEntry(character) : null,
    main,
    sideboard,
    entries,
    mainCount: copies(main),
    sideboardCount: copies(sideboard),
    topLesson,
    status,
  }
}

export function findDecks(db: DB, query: string, viewerId: string | null): Promise<DeckSuggestion[]> {
  return suggestDecks(db, { query, viewerId, limit: MAX_CHOICES })
}

// suggestDecks only returns public decks and the viewer's own, so a private
// suggestion is always the viewer's own.
export function accessOf(s: DeckSuggestion): 'public' | 'own-private' {
  return s.visibility === 'public' ? 'public' : 'own-private'
}

// Shared by autocomplete and the "did you mean" menu, so a deck reads the same
// in both. Only the person typing sees either, so naming their own private
// deck here leaks nothing.
export function suggestionLabel(s: DeckSuggestion, locale: string): string {
  const lock = s.visibility === 'public' ? '' : '🔒 '
  return clampLabel(`${lock}${s.name} · @${s.author} · ${t(locale, `deck.format.${s.format}`)}`)
}

export async function resolveDeckRef(db: DB, input: string, viewerId: string | null): Promise<DeckRef> {
  // The whole input, not the parsed id: parseDeckRef cuts at the first "/",
  // which would turn a deck called "Aggro/Control" into "Aggro", and a name
  // starting with "#" into no id at all.
  const query = input.trim()
  if (!query) return { kind: 'none' }
  const id = parseDeckRef(query)
  if (id) {
    const hit = await getDeckAccess(db, id, viewerId)
    if (hit) return { kind: 'deck', id, ...hit }
  }

  const matches = await findDecks(db, query, viewerId)
  if (matches.length === 0) return { kind: 'none' }
  const exact = matches.filter((m) => m.exactName)
  const one = matches.length === 1 ? matches[0] : exact.length === 1 ? exact[0] : null
  if (one) return { kind: 'deck', id: one.id, name: one.name, access: accessOf(one) }
  return { kind: 'ambiguous', options: matches }
}
