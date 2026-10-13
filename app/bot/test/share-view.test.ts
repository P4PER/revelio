import { describe, it, expect } from 'vitest'
import { ComponentType } from 'discord.js'
import type { CardBrowseHit } from '@revelio/search'
import { sharePicker, shareView } from '../src/discord/v2/share-view'
import type { CardBrowseState } from '../src/discord/components/custom-id'
import { measure } from '../src/discord/v2/limits'
import { buttonsOf, flatten, textOf } from './helpers/v2'

const hit = (n: number): CardBrowseHit => ({
  id: `base-${n}`, name: `Card ${n}`, setCode: 'base', number: String(n), types: ['spell'],
  lesson: 'charms', cost: 2, imageVersion: 1, imageLang: 'en', defaultLanguage: 'en', orientation: null,
})
const hits = [1, 2, 3, 4, 5].map(hit)
const state: CardBrowseState = { page: 2, lesson: 'charms', type: null, set: null, query: 'lumos' }
const opts = { locale: 'en', imageBase: 'https://img.test', siteBase: 'https://revelio.cards', sharerId: '111' }
type Select = { custom_id: string; min_values?: number; max_values?: number; options: { value: string; default?: boolean }[] }
const selectOf = (v: { components: unknown[] }) =>
  flatten(v).find((n) => n.type === ComponentType.StringSelect) as unknown as Select

describe('sharePicker', () => {
  it('preselects every card on the page and asks for at least one', () => {
    const select = selectOf({ components: sharePicker(hits, state, 'en') })
    expect(select.custom_id.startsWith('v1:sp:')).toBe(true)
    expect(select.options.every((o) => o.default)).toBe(true)
    expect([select.min_values, select.max_values]).toEqual([1, 5])
  })

  it('cancels back to the same page', () => {
    const cancel = buttonsOf({ components: sharePicker(hits, state, 'en') })[0]
    expect(cancel.custom_id?.startsWith('v1:s:2:')).toBe(true)
  })
})

describe('shareView', () => {
  const view = (h = hits, s = state) => ({ components: shareView(h, s, opts) })

  it('names who shared what, from which search', () => {
    expect(textOf(view())).toMatch(/^<@111> shared 5 cards from a search for "lumos"\./)
  })

  it('says "a card" when one card is shared', () => {
    expect(textOf(view([hit(1)]))).toMatch(/^<@111> shared a card from a search for "lumos"\./)
    expect(textOf(view([hit(1)], { ...state, query: '' }))).toMatch(/^<@111> shared a card\./)
  })

  it('escapes markdown in the query it echoes to the channel', () => {
    expect(textOf(view(hits, { ...state, query: '[x](https://evil.example)' })))
      .toContain('\\[x\\]\\(https://evil.example\\)')
  })

  it('has no pager and nothing that changes the message', () => {
    const ids = flatten(view()).flatMap((n) => (n.custom_id ? [n.custom_id] : []))
    expect(ids).toEqual(['v1:pk'])
  })

  it('links the full search', () => {
    expect(buttonsOf(view()).find((b) => b.url)?.url).toBe('https://revelio.cards/search?q=lumos&lesson=charms')
  })

  it('stays inside the limits', () => {
    expect(measure(shareView(hits, { ...state, query: 'x'.repeat(50) }, opts)).components).toBeLessThanOrEqual(40)
  })
})
