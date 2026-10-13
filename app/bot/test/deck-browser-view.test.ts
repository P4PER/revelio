import { describe, it, expect } from 'vitest'
import { ComponentType } from 'discord.js'
import type { DeckSummary, PublicDeckEntry } from '@revelio/db'
import { ownDecksView, publicDecksView } from '../src/discord/v2/deck-browser-view'
import type { DeckBrowseState } from '../src/discord/components/custom-id'
import { measure } from '../src/discord/v2/limits'
import { buttonsOf, flatten, mediaUrls, textOf } from './helpers/v2'

const entry = (n: number, over: Partial<PublicDeckEntry> = {}): PublicDeckEntry => ({
  id: `00000000-0000-0000-0000-00000000000${n}`, name: `Deck ${n}`, format: 'classic', author: 'ann',
  lessons: ['charms'], likeCount: 3, viewCount: 9, cardCount: 61, updatedAt: '2026-10-01T00:00:00.000Z',
  likedByViewer: false, starterCardId: 'base-1', starterArtCropVersion: 2, ...over,
})
const state: DeckBrowseState = { scope: 'public', page: 1, format: null, sort: 'likes', lesson: null, query: '' }
const opts = { locale: 'en', imageBase: 'https://img.test', siteBase: 'https://revelio.cards' }
const pub = (entries: PublicDeckEntry[], over = {}) =>
  ({ components: publicDecksView({ entries, total: 12, page: 1, pages: 3, ...over }, state, opts) })
const ids = (v: { components: unknown[] }) => flatten(v).flatMap((n) => (n.custom_id ? [n.custom_id] : []))

describe('publicDecksView', () => {
  it('stays inside the limits at its fullest', () => {
    const full = publicDecksView(
      { entries: [1, 2, 3, 4, 5].map((n) => entry(n)), total: 99, page: 2, pages: 20 },
      { ...state, page: 2, format: 'classic', lesson: 'charms', query: 'x'.repeat(50) }, opts,
    )
    expect(measure(full).components).toBeLessThanOrEqual(40)
  })

  it('shows each deck with its starter art, author, format and counts', () => {
    const v = pub([entry(1)])
    expect(textOf(v)).toContain('**Deck 1** · @ann · Classic\n3 likes · 61 cards · Charms')
    expect(mediaUrls(v)).toEqual(['https://img.test/cards/art-crop/base-1.2.webp'])
  })

  it('draws a deck without a starting character as text', () => {
    const v = pub([entry(1, { starterCardId: null, starterArtCropVersion: null })])
    expect(flatten(v).some((n) => n.type === ComponentType.Section)).toBe(false)
  })

  it('escapes a hostile deck name and author', () => {
    const t = textOf(pub([entry(1, { name: '[x](https://evil.example)', author: '*a*' })]))
    expect(t).toContain('**\\[x\\]\\(https://evil.example\\)** · @\\*a\\*')
  })

  it('offers open, format, order and lesson menus and the site link', () => {
    const v = pub([entry(1)])
    const kinds = ids(v).map((id) => id.split(':')[1])
    expect(kinds).toEqual(expect.arrayContaining(['do', 'df', 'ds', 'dl', 'd', 'pg']))
    expect(buttonsOf(v).find((b) => b.url)?.url).toBe('https://revelio.cards/decks')
  })

  it('says when nothing matched and keeps the menus', () => {
    const v = pub([], { total: 0, pages: 1 })
    expect(textOf(v)).toContain('No public deck matched.')
    expect(ids(v).some((id) => id.startsWith('v1:do:'))).toBe(false)
    expect(ids(v).some((id) => id.startsWith('v1:df:'))).toBe(true)
  })

  it('gives every control a distinct id', () => {
    const all = ids(pub([1, 2, 3].map((n) => entry(n))))
    expect(new Set(all).size).toBe(all.length)
  })
})

describe('ownDecksView', () => {
  const own = (n: number, over: Partial<DeckSummary> = {}): DeckSummary => ({
    id: `d${n}`, name: `Mine ${n}`, format: 'classic', visibility: 'private', cardCount: 61,
    mainCount: 60, hasCharacter: true, characterName: 'Harry', updatedAt: '2026-10-01T00:00:00.000Z', ...over,
  })
  const mine: DeckBrowseState = { ...state, scope: 'mine', sort: 'updated' }

  it('lists the page of own decks, private ones marked, with an open menu', () => {
    const v = { components: ownDecksView({ decks: [own(1), own(2, { visibility: 'public' })], total: 2, page: 1, pages: 1 }, mine, opts) }
    expect(textOf(v)).toContain('Your decks (2)')
    expect(textOf(v)).toContain('🔒 **Mine 1** · Classic · 60 cards')
    expect(textOf(v)).toContain('**Mine 2** · Classic · 60 cards')
    expect(textOf(v)).not.toContain('🔒 **Mine 2**')
    expect(ids(v).some((id) => id.startsWith('v1:do:m:'))).toBe(true)
  })

  // A deck saved before the name bound can carry any length; ten of them must
  // not push the owner's whole list past Discord's text budget.
  it('stays inside the text budget with legacy over-long names', () => {
    const long = '*'.repeat(600)
    const decks = Array.from({ length: 10 }, (_, i) => own(i, { id: `d${i}`, name: `${i}${long}` }))
    const view = ownDecksView({ decks, total: 10, page: 1, pages: 1 }, mine, opts)
    expect(measure(view).text).toBeLessThanOrEqual(4000)
  })

  it('has no filter menus', () => {
    const v = { components: ownDecksView({ decks: [own(1)], total: 1, page: 1, pages: 1 }, mine, opts) }
    expect(ids(v).some((id) => /^v1:d[fsl]:/.test(id))).toBe(false)
  })
})
