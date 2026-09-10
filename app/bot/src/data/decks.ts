import { getDeckForViewer, type DB } from '@revelio/db'
import { evaluateDeck, type DeckCardMeta, type DeckFormat, type DeckStatus } from '@revelio/core'

export type DeckEntryView = {
  name: string
  quantity: number
  cost: number | null
  lesson: string | null
}

export type PublicDeck = {
  id: string
  name: string
  format: DeckFormat
  ownerUsername: string | null
  character: DeckEntryView | null
  main: DeckEntryView[]
  sideboard: DeckEntryView[]
  mainCount: number
  sideboardCount: number
  topLesson: string | null
  status: DeckStatus
}

function byCostThenName(a: DeckEntryView, b: DeckEntryView): number {
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

export async function getPublicDeck(db: DB, ref: string): Promise<PublicDeck | null> {
  // Always a null viewer here: this phase serves public decks only, and
  // getDeckForViewer is what enforces that. Never call getDeck directly.
  const res = await getDeckForViewer(db, parseDeckRef(ref), null)
  if (!res) return null
  const { deck, views, ownerUsername } = res

  const toEntry = (v: (typeof views)[number]): DeckEntryView => ({
    name: v.name, quantity: v.quantity, cost: v.cost, lesson: v.lesson,
  })
  const main = views.filter((v) => v.zone === 'main').map(toEntry).sort(byCostThenName)
  const sideboard = views.filter((v) => v.zone === 'sideboard').map(toEntry).sort(byCostThenName)
  const character = views.find((v) => v.zone === 'character')

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
    mainCount: copies(main),
    sideboardCount: copies(sideboard),
    topLesson,
    status,
  }
}
