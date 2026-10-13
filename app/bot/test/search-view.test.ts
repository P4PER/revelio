import { describe, it, expect } from 'vitest'
import { ComponentType } from 'discord.js'
import type { CardBrowseHit } from '@revelio/search'
import { searchView, type SearchViewOptions } from '../src/discord/v2/search-view'
import { decodeCustomId, type CardBrowseState } from '../src/discord/components/custom-id'
import type { CardPage } from '../src/data/cards'
import { measure } from '../src/discord/v2/limits'
import { buttonsOf, flatten, textOf } from './helpers/v2'

const hit = (n: number): CardBrowseHit => ({
  id: `base-${n}`, name: `Card ${n}`, setCode: 'base', number: String(n), types: ['spell'],
  lesson: 'charms', cost: 2, imageVersion: 1, imageLang: 'en', defaultLanguage: 'en', orientation: null,
})
const page = (n: number, over: Partial<CardPage> = {}): CardPage => ({
  hits: Array.from({ length: n }, (_, i) => hit(i + 1)), total: 23, page: 2, pageSize: 5, pages: 5, ...over,
})
const state: CardBrowseState = { page: 2, lesson: null, type: null, set: null, query: 'lumos' }
const sets = Array.from({ length: 30 }, (_, i) => ({ code: `s${i}`, name: `Set ${i}` }))
const opts: SearchViewOptions = {
  locale: 'en', imageBase: 'https://img.test', siteBase: 'https://revelio.cards', sets, canPost: true,
}
const render = (p: CardPage, s: CardBrowseState = state, o: Partial<SearchViewOptions> = {}) =>
  ({ components: searchView(p, s, { ...opts, ...o }) })
const selects = (v: { components: unknown[] }) => flatten(v).filter((n) => n.type === ComponentType.StringSelect) as {
  custom_id: string; placeholder?: string; options: { value: string; default?: boolean }[]
}[]

describe('searchView', () => {
  // Text inputs exist only in modals, so the query is changed from a button
  // beside the header; it must be there whatever the page shows.
  it('offers Search beside the header on every page', () => {
    const cases = [
      render(page(5)),
      render(page(0)),
      render(page(0, { total: 0, page: 1, pages: 1 }), { ...state, page: 1 }),
    ]
    for (const v of cases) {
      const section = flatten(v).find((n) => n.type === ComponentType.Section) as unknown as {
        components: { content: string }[]; accessory: { custom_id: string; label: string }
      }
      expect(section.accessory.label).toBe('Search')
      expect(decodeCustomId(section.accessory.custom_id)).toMatchObject({ kind: 'sq', state: { query: 'lumos' } })
    }
  })

  it('stays inside the limits at its fullest', () => {
    const full = render(page(5), { ...state, lesson: 'charms', type: 'spell', set: 's29', query: 'x'.repeat(50) })
    expect(measure(full.components).components).toBeLessThanOrEqual(40)
  })

  it('heads the page with the query and the total', () => {
    expect(textOf(render(page(5)))).toContain('Cards found for "lumos": **23**')
  })

  it('escapes markdown in the echoed query', () => {
    const v = render(page(5), { ...state, query: '[x](https://evil.example)' })
    expect(textOf(v)).toContain('\\[x\\]\\(https://evil.example\\)')
  })

  it('names active filters in the header', () => {
    const v = render(page(5), { ...state, lesson: 'charms', set: 's3' })
    expect(textOf(v)).toContain('Charms')
    expect(textOf(v)).toContain('Set 3')
  })

  it('offers an open menu with one option per card', () => {
    const open = selects(render(page(5))).find((s) => s.custom_id.startsWith('v1:co:'))
    expect(open?.options.map((o) => o.value)).toEqual(['base-1', 'base-2', 'base-3', 'base-4', 'base-5'])
  })

  it('marks the active filter value and offers Any', () => {
    const lesson = selects(render(page(5), { ...state, lesson: 'charms' })).find((s) => s.custom_id.startsWith('v1:sl:'))
    expect(lesson?.options[0]).toMatchObject({ value: '-', default: false })
    expect(lesson?.options.find((o) => o.value === 'charms')?.default).toBe(true)
  })

  // A message select has no label: an unset filter selects nothing, so its
  // placeholder names it instead of three identical "Any" boxes.
  it('names an unset filter by its placeholder', () => {
    const all = selects(render(page(5)))
    const of = (kind: string) => all.find((s) => s.custom_id.startsWith(`v1:${kind}:`))!
    expect([of('sl'), of('st'), of('ss')].map((s) => s.placeholder)).toEqual(['Any lesson', 'Any card type', 'Any set'])
    for (const s of [of('sl'), of('st'), of('ss')]) expect(s.options.some((o) => o.default)).toBe(false)
  })

  it('lists at most 25 sets and keeps the active one even past the cut', () => {
    const set = selects(render(page(5), { ...state, set: 's29' })).find((s) => s.custom_id.startsWith('v1:ss:'))
    expect(set?.options).toHaveLength(25)
    expect(set?.options.some((o) => o.value === 's29' && o.default)).toBe(true)
  })

  it('disables next on a short page', () => {
    const next = buttonsOf(render(page(3))).find((b) => b.label === 'Next')
    expect(next?.disabled).toBe(true)
  })

  // Totals are estimates: a page inside them can be empty.
  it('says an empty page is past the end, with previous still enabled', () => {
    const v = render(page(0))
    expect(textOf(v)).toContain('No more results on this page')
    expect(buttonsOf(v).find((b) => b.label === 'Previous')?.disabled).toBe(false)
    expect(selects(v).some((s) => s.custom_id.startsWith('v1:co:'))).toBe(false)
  })

  it('keeps the filters but drops rows, open and share when nothing matched', () => {
    const v = render(page(0, { total: 0, page: 1, pages: 1 }), { ...state, page: 1 })
    expect(textOf(v)).toContain('Nothing matched that search.')
    expect(selects(v).some((s) => s.custom_id.startsWith('v1:sl:'))).toBe(true)
    expect(buttonsOf(v).some((b) => b.label === 'Share')).toBe(false)
  })

  it('offers Share in a server and not outside one', () => {
    expect(buttonsOf(render(page(5))).some((b) => b.label === 'Share')).toBe(true)
    expect(buttonsOf(render(page(5), state, { canPost: false })).some((b) => b.label === 'Share')).toBe(false)
  })

  it('links the same search on the site', () => {
    const site = buttonsOf(render(page(5), { ...state, lesson: 'charms' })).find((b) => b.url)
    expect(site?.url).toBe('https://revelio.cards/search?q=lumos&lesson=charms')
  })

  it('links a search without a query in the same number order', () => {
    const site = buttonsOf(render(page(5), { ...state, query: '', set: 's3' })).find((b) => b.url)
    expect(site?.url).toBe('https://revelio.cards/search?q=&set=s3&sort=number')
  })

  it('gives every control a distinct id', () => {
    const ids = flatten(render(page(5))).flatMap((n) => (n.custom_id ? [n.custom_id] : []))
    expect(new Set(ids).size).toBe(ids.length)
  })
})
