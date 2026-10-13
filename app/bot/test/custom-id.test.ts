import { describe, it, expect } from 'vitest'
import { LESSONS, TYPES } from '@revelio/core'
import {
  clampQuery,
  decodeCustomId,
  encodeCustomId,
  MAX_CUSTOM_ID,
  MAX_PAGE,
  MAX_QUERY,
  type CardBrowseState,
  type CustomId,
  type DeckBrowseState,
} from '../src/discord/components/custom-id'

const card: CardBrowseState = { page: 3, lesson: 'charms', type: 'spell', set: 'base', query: 'lumos' }
const deck: DeckBrowseState = {
  scope: 'public', page: 2, format: 'classic', sort: 'views', lesson: null, query: '@hermione',
}
// The longest anything can be: last page, last lesson and type, an 8-character
// set code, and a query of 2-unit emoji that clampQuery cuts to 50 units.
const worstCard: CardBrowseState = {
  page: MAX_PAGE,
  lesson: LESSONS[LESSONS.length - 1].code,
  type: TYPES[TYPES.length - 1].code,
  set: 'abcdefgh',
  query: '\u{1F600}'.repeat(40),
}
const worstDeck: DeckBrowseState = {
  scope: 'mine', page: MAX_PAGE, format: 'revival', sort: 'updated',
  lesson: LESSONS[LESSONS.length - 1].code, query: 'x'.repeat(80),
}

const ALL: CustomId[] = [
  ...(['s', 'sl', 'st', 'ss', 'co', 'cb', 'sh', 'sp'] as const).map((kind) => ({ kind, state: card })),
  ...(['d', 'dl', 'df', 'ds', 'do'] as const).map((kind) => ({ kind, state: deck })),
  { kind: 'cp', cardId: 'chamber-of-secrets-12' },
  { kind: 'dp', deckId: '6f1c2a5e-9a8b-4c3d-8e7f-0a1b2c3d4e5f' },
  { kind: 'pk' },
  { kind: 'pg', of: 'cards' },
  { kind: 'pg', of: 'decks' },
]

describe('custom ids', () => {
  it.each(ALL.map((id) => [id.kind, id] as const))('round-trips %s', (_kind, id) => {
    expect(decodeCustomId(encodeCustomId(id))).toEqual(id)
  })

  it('stays inside 100 characters for the worst case of every kind', () => {
    const worst: CustomId[] = [
      ...(['s', 'sl', 'st', 'ss', 'co', 'cb', 'sh', 'sp'] as const).map((kind) => ({ kind, state: worstCard })),
      ...(['d', 'dl', 'df', 'ds', 'do'] as const).map((kind) => ({ kind, state: worstDeck })),
      { kind: 'cp', cardId: 'x'.repeat(64) },
      { kind: 'dp', deckId: 'x'.repeat(64) },
    ]
    for (const id of worst) expect(encodeCustomId(id).length).toBeLessThanOrEqual(MAX_CUSTOM_ID)
  })

  it('keeps a query containing colons intact', () => {
    const id: CustomId = { kind: 's', state: { ...card, query: 'a:b::c' } }
    expect(decodeCustomId(encodeCustomId(id))).toEqual(id)
  })

  it('writes a lesson as an index, not its code', () => {
    const id = encodeCustomId({ kind: 's', state: { ...card, lesson: 'care_of_magical_creatures' } })
    expect(id).not.toContain('care_of_magical_creatures')
  })

  it.each([
    ['another version', 'v2:s:1:-:-:-:q'],
    ['an unknown kind', 'v1:zz:1'],
    ['a /deck prompt id', 'deck:post'],
    ['page zero', 'v1:s:0:-:-:-:q'],
    ['a page past the cap', `v1:s:${MAX_PAGE + 1}:-:-:-:q`],
    ['a lesson index out of range', 'v1:s:1:z:-:-:q'],
    ['a malformed set', 'v1:s:1:-:-:no/pe:q'],
    ['too few fields', 'v1:s:1:-'],
    ['an unknown deck scope', 'v1:d:x:1:-:0:-:q'],
    ['a card id with a space', 'v1:cp:a b'],
    ['an extra field on pk', 'v1:pk:1'],
  ])('rejects %s', (_label, raw) => {
    expect(decodeCustomId(raw)).toBeNull()
  })

  it('refuses to encode a lesson it does not know', () => {
    expect(() => encodeCustomId({ kind: 's', state: { ...card, lesson: 'divination' } })).toThrow()
  })
})

describe('clampQuery', () => {
  it('trims and cuts to 50 UTF-16 units on a whole code point', () => {
    const cut = clampQuery(`  ${'\u{1F600}'.repeat(40)}  `)
    expect(cut.length).toBe(MAX_QUERY)
    expect(cut).toBe('\u{1F600}'.repeat(25))
  })

  it('leaves a short query alone', () => {
    expect(clampQuery('lumos')).toBe('lumos')
  })
})
