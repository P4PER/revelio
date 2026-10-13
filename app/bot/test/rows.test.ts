import { describe, it, expect } from 'vitest'
import { ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js'
import type { CardBrowseHit } from '@revelio/search'
import { addCardRow, cardRowText } from '../src/discord/v2/rows'
import { pagerRow } from '../src/discord/v2/pager'
import { cardThumbUrl, container, plain } from '../src/discord/v2/parts'
import { flatten, mediaUrls, textOf } from './helpers/v2'

const hit: CardBrowseHit = {
  id: 'base-12', name: 'Nimbus 2000', setCode: 'base', number: '12', types: ['item'],
  lesson: 'quidditch', cost: 4, imageVersion: 3, imageLang: 'en', defaultLanguage: 'en', orientation: null,
}
const opts = { locale: 'en', imageBase: 'https://img.test' }
const rowOf = (h: CardBrowseHit) => {
  const view = container()
  addCardRow(view, h, opts)
  return { components: [view] }
}

describe('plain', () => {
  it('neutralizes markdown and masked links', () => {
    expect(plain('[free](https://evil.example) **x**')).toBe('\\[free\\]\\(https://evil.example\\) \\*\\*x\\*\\*')
  })

  it('leaves ordinary words alone', () => {
    expect(plain('lumos maxima')).toBe('lumos maxima')
  })
})

describe('cardThumbUrl', () => {
  it('uses the portrait thumb, or the landscape one for a horizontal card', () => {
    expect(cardThumbUrl(hit, 'https://img.test')).toBe('https://img.test/cards/thumb/base-12.3.webp')
    expect(cardThumbUrl({ ...hit, orientation: 'horizontal', imageLang: 'de' }, 'https://img.test'))
      .toBe('https://img.test/cards/landscape-thumb/base-12.de.3.webp')
  })

  it('is null for a card without an image', () => {
    expect(cardThumbUrl({ ...hit, imageVersion: null }, 'https://img.test')).toBeNull()
  })
})

describe('card rows', () => {
  it('names the card and its printing, then its stats', () => {
    expect(cardRowText(hit, 'en')).toBe('**Nimbus 2000** · base #12\nItem · Quidditch · Cost 4')
  })

  it('is a section with the thumbnail beside the text', () => {
    const row = rowOf(hit)
    expect(flatten(row).some((n) => n.type === ComponentType.Section)).toBe(true)
    expect(mediaUrls(row)).toEqual(['https://img.test/cards/thumb/base-12.3.webp'])
  })

  // A section must have an accessory, so a card with no image is plain text.
  it('is plain text when the card has no image', () => {
    const row = rowOf({ ...hit, imageVersion: null })
    expect(flatten(row).some((n) => n.type === ComponentType.Section)).toBe(false)
    expect(textOf(row)).toContain('**Nimbus 2000**')
  })
})

describe('pagerRow', () => {
  const ids = { prevId: 'v1:s:1:-:-:-:', nextId: 'v1:s:3:-:-:-:', indicatorId: 'v1:pg:c' }
  const buttons = (o: Partial<Parameters<typeof pagerRow>[0]>) =>
    pagerRow({ locale: 'en', page: 2, pages: 5, hasNext: true, ...ids, ...o }).toJSON().components as {
      label?: string; disabled?: boolean; custom_id?: string
    }[]

  it('shows previous, the page, and next, the page disabled', () => {
    const [prev, page, next] = buttons({})
    expect([prev.label, page.label, next.label]).toEqual(['Previous', '2 / 5', 'Next'])
    expect([prev.disabled, page.disabled, next.disabled]).toEqual([false, true, false])
  })

  it('disables previous on the first page and next without a next page', () => {
    const [prev, , next] = buttons({ page: 1, hasNext: false })
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(true)
  })

  it('appends trailing buttons', () => {
    const extra = new ButtonBuilder().setStyle(ButtonStyle.Link).setURL('https://x.test').setLabel('site')
    expect(buttons({ trailing: [extra] })).toHaveLength(4)
  })
})
