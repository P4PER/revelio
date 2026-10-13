import { z } from 'zod'
import { DeckFormat, LESSONS, TYPES } from '@revelio/core'

// What a card browser shows: one page of one search. Rebuilt from the id on
// every click, so it is all the state there is (spec section 2).
export type CardBrowseState = {
  page: number
  lesson: string | null
  type: string | null
  set: string | null
  query: string
}

export type DeckSort = (typeof DECK_SORTS)[number]

// 'mine' is /mydecks over the caller's own decks; 'public' is /decks.
export type DeckBrowseState = {
  scope: 'public' | 'mine'
  page: number
  format: DeckFormat | null
  sort: DeckSort
  lesson: string | null
  query: string
}

// One kind per control on a view, so no two controls of one message share an
// id (Discord rejects duplicates): s page change, sl/st/ss lesson/type/set
// select, co open a card, cb back to results, sh Share, sp the share picker,
// sq the Search button and sm the search form it opens.
export type CardKind = 's' | 'sl' | 'st' | 'ss' | 'co' | 'cb' | 'sh' | 'sp' | 'sq' | 'sm'
// d page change, dl/df/ds lesson/format/sort select, do open a deck.
export type DeckKind = 'd' | 'dl' | 'df' | 'ds' | 'do'

// cp/dp post a card/deck, pk "View a card" on a shared list, pg the disabled
// page indicator (a non-link button needs an id even when it does nothing),
// sx the share picker's Post button: the selection as a bitmask of page rows,
// since five card ids do not fit in 100 characters.
export type CustomId =
  | { kind: CardKind; state: CardBrowseState }
  | { kind: DeckKind; state: DeckBrowseState }
  | { kind: 'cp'; cardId: string }
  | { kind: 'dp'; deckId: string }
  | { kind: 'pk' }
  | { kind: 'pg'; of: 'cards' | 'decks' }
  | { kind: 'sx'; mask: number; state: CardBrowseState }

// A layout change bumps the version; decode answers null for any other one,
// which the router turns into "these results are out of date".
export const ID_VERSION = 'v1'
// Discord's ceiling for a custom id.
export const MAX_CUSTOM_ID = 100
// The /search and /decks query option's max length, and the cut clampQuery
// makes. The worst-case test in custom-id.test.ts is what proves it fits.
export const MAX_QUERY = 50
export const MAX_PAGE = 9999
// One bit per row of a five-row page; one base-36 character.
export const MAX_MASK = 0b11111
// Mirrors @revelio/db's PublicDeckSort; the index into it is what the id
// carries, so the order here is part of the id format.
export const DECK_SORTS = ['likes', 'views', 'newest', 'updated'] as const

const CARD_KINDS: readonly string[] = ['s', 'sl', 'st', 'ss', 'co', 'cb', 'sh', 'sp', 'sq', 'sm']
const DECK_KINDS: readonly string[] = ['d', 'dl', 'df', 'ds', 'do']
// Lessons, types and formats go in as a one-character index into these lists:
// 'care_of_magical_creatures' alone is 25 characters. Their order is therefore
// part of the id format too; appending is safe, reordering breaks old ids.
const LESSON_CODES: readonly string[] = LESSONS.map((l) => l.code)
const TYPE_CODES: readonly string[] = TYPES.map((t) => t.code)
const FORMATS: readonly DeckFormat[] = DeckFormat.options
const NONE = '-'
// Syntactic only: a well-formed but unknown set simply finds no cards.
const SET_CODE = /^[a-z0-9-]{1,8}$/i
const ENTITY_ID = /^[\w.-]{1,64}$/
const Page = z.coerce.number().int().min(1).max(MAX_PAGE)

function toIndex(list: readonly string[], value: string | null): string {
  if (value == null) return NONE
  const i = list.indexOf(value)
  if (i < 0) throw new Error(`cannot encode unknown value "${value}"`)
  return i.toString(36)
}

// null for "none", undefined for anything that is not a valid index.
function fromIndex<T extends string>(list: readonly T[], raw: string): T | null | undefined {
  if (raw === NONE) return null
  if (!/^[0-9a-z]$/.test(raw)) return undefined
  return list[parseInt(raw, 36)]
}

function encodeCard(s: CardBrowseState): string {
  if (s.set != null && !SET_CODE.test(s.set)) throw new Error(`cannot encode set "${s.set}"`)
  return [
    Math.min(Math.max(1, s.page), MAX_PAGE),
    toIndex(LESSON_CODES, s.lesson),
    toIndex(TYPE_CODES, s.type),
    s.set ?? NONE,
    clampQuery(s.query),
  ].join(':')
}

function encodeDeck(s: DeckBrowseState): string {
  return [
    s.scope === 'mine' ? 'm' : 'p',
    Math.min(Math.max(1, s.page), MAX_PAGE),
    toIndex(FORMATS, s.format),
    toIndex(DECK_SORTS, s.sort),
    toIndex(LESSON_CODES, s.lesson),
    clampQuery(s.query),
  ].join(':')
}

// The query is always the last field, so it may contain colons itself.
function decodeCard(fields: string[]): CardBrowseState | null {
  if (fields.length < 5) return null
  const [pageRaw, lessonRaw, typeRaw, set, ...query] = fields
  const page = Page.safeParse(pageRaw)
  const lesson = fromIndex(LESSON_CODES, lessonRaw)
  const type = fromIndex(TYPE_CODES, typeRaw)
  if (!page.success || lesson === undefined || type === undefined) return null
  if (set !== NONE && !SET_CODE.test(set)) return null
  return { page: page.data, lesson, type, set: set === NONE ? null : set, query: query.join(':') }
}

function decodeDeck(fields: string[]): DeckBrowseState | null {
  if (fields.length < 6) return null
  const [scopeRaw, pageRaw, formatRaw, sortRaw, lessonRaw, ...query] = fields
  if (scopeRaw !== 'm' && scopeRaw !== 'p') return null
  const page = Page.safeParse(pageRaw)
  const format = fromIndex(FORMATS, formatRaw)
  const sort = fromIndex(DECK_SORTS, sortRaw)
  const lesson = fromIndex(LESSON_CODES, lessonRaw)
  if (!page.success || format === undefined || !sort || lesson === undefined) return null
  return {
    scope: scopeRaw === 'm' ? 'mine' : 'public',
    page: page.data, format, sort, lesson, query: query.join(':'),
  }
}

// Trimmed, then cut to MAX_QUERY UTF-16 units on a whole code point: Discord's
// option max_length counts characters, so 50 emoji would otherwise be 100
// units and blow the id. A cut query still finds what its first 50 found.
export function clampQuery(query: string): string {
  let out = ''
  for (const ch of query.trim()) {
    if (out.length + ch.length > MAX_QUERY) break
    out += ch
  }
  return out
}

// A card or deck id as it may appear in an id or a select value. Select values
// come back from the client, so this runs before one reaches a query.
export function isEntityId(value: string): boolean {
  return ENTITY_ID.test(value)
}

export function encodeCustomId(id: CustomId): string {
  let body: string
  switch (id.kind) {
    case 's': case 'sl': case 'st': case 'ss': case 'co': case 'cb': case 'sh': case 'sp':
    case 'sq': case 'sm':
      body = encodeCard(id.state)
      break
    case 'd': case 'dl': case 'df': case 'ds': case 'do':
      body = encodeDeck(id.state)
      break
    case 'cp':
      body = id.cardId
      break
    case 'dp':
      body = id.deckId
      break
    case 'pk':
      body = ''
      break
    case 'pg':
      body = id.of === 'cards' ? 'c' : 'd'
      break
    case 'sx':
      if (!Number.isInteger(id.mask) || id.mask < 1 || id.mask > MAX_MASK) {
        throw new Error(`cannot encode share mask ${id.mask}`)
      }
      body = `${id.mask.toString(36)}:${encodeCard(id.state)}`
      break
  }
  const out = body ? `${ID_VERSION}:${id.kind}:${body}` : `${ID_VERSION}:${id.kind}`
  if (out.length > MAX_CUSTOM_ID) throw new Error(`custom id ${id.kind} is ${out.length} characters`)
  return out
}

// Custom ids round-trip through the client, so this treats them as untrusted:
// anything malformed, from another version, or out of range is null. Nothing
// decoded here is an authorization - see spec section 2.
export function decodeCustomId(raw: string): CustomId | null {
  const [version, kind, ...fields] = raw.split(':')
  if (version !== ID_VERSION || !kind) return null
  if (CARD_KINDS.includes(kind)) {
    const state = decodeCard(fields)
    return state ? { kind: kind as CardKind, state } : null
  }
  if (DECK_KINDS.includes(kind)) {
    const state = decodeDeck(fields)
    return state ? { kind: kind as DeckKind, state } : null
  }
  if (kind === 'cp' || kind === 'dp') {
    if (fields.length !== 1 || !ENTITY_ID.test(fields[0])) return null
    return kind === 'cp' ? { kind, cardId: fields[0] } : { kind, deckId: fields[0] }
  }
  if (kind === 'pk') return fields.length === 0 ? { kind } : null
  if (kind === 'sx') {
    const [maskRaw, ...rest] = fields
    const mask = maskRaw && /^[0-9a-z]$/.test(maskRaw) ? parseInt(maskRaw, 36) : 0
    const state = decodeCard(rest)
    return mask >= 1 && mask <= MAX_MASK && state ? { kind, mask, state } : null
  }
  if (kind === 'pg' && fields.length === 1 && (fields[0] === 'c' || fields[0] === 'd')) {
    return { kind, of: fields[0] === 'c' ? 'cards' : 'decks' }
  }
  return null
}
