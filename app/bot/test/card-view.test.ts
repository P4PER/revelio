import { describe, it, expect } from 'vitest'
import { ButtonBuilder, ButtonStyle, ComponentType } from 'discord.js'
import type { SearchDocument } from '@revelio/search'
import { cardView, type CardViewOptions } from '../src/discord/v2/card-view'
import { measure, MAX_TEXT } from '../src/discord/v2/limits'
import type { CardDetail } from '../src/data/card-detail'
import { buttonsOf, flatten, mediaUrls, textOf } from './helpers/v2'

const doc: SearchDocument = {
  id: 'base-12', setCode: 'base', number: '12', numberSort: '0:000012', name: 'Nimbus 2000',
  text: 'Whenever you play a Quidditch card, draw a card.',
  flavorText: 'The fastest broom on the market.',
  types: ['item'], subTypes: ['broom'], lesson: 'quidditch', rarity: 'rare', finishes: ['normal'],
  legality: 'legal', cost: 4, damage: null, isOfficial: true, imageLang: 'en', imageVersion: 3,
  artCropVersion: null, defaultLanguage: 'en', orientation: null,
}

const detail = (over: Partial<SearchDocument> = {}, rest: Partial<CardDetail> = {}): CardDetail => ({
  doc: { ...doc, ...over }, setName: 'Base Set', rulings: [], subTypeLabels: {}, ...rest,
})

const opts: CardViewOptions = {
  locale: 'en', imageBase: 'https://img.revelio.cards', siteBase: 'https://revelio.cards',
}

const view = (d: CardDetail, o: Partial<CardViewOptions> = {}) => ({ components: cardView(d, { ...opts, ...o }) })

describe('cardView', () => {
  it('heads the card with its name and links to the card page', () => {
    const v = view(detail())
    expect(textOf(v)).toMatch(/^## Nimbus 2000\n/)
    const link = buttonsOf(v).find((b) => b.style === ButtonStyle.Link)
    expect(link?.url).toBe('https://revelio.cards/card/base-12')
    expect(link?.label).toBe('Open on revelio.cards')
  })

  it('shows the 300px thumb in a gallery, never the full image', () => {
    expect(mediaUrls(view(detail()))).toEqual(['https://img.revelio.cards/cards/thumb/base-12.3.webp'])
  })

  it('shows a horizontal card upright through its landscape thumb', () => {
    expect(mediaUrls(view(detail({ orientation: 'horizontal', imageLang: 'de' }))))
      .toEqual(['https://img.revelio.cards/cards/landscape-thumb/base-12.de.3.webp'])
  })

  it('has no gallery when the card has no image', () => {
    const v = view(detail({ imageLang: null, imageVersion: null }))
    expect(flatten(v).some((n) => n.type === ComponentType.MediaGallery)).toBe(false)
  })

  it('tints the container with the lesson colour', () => {
    expect(cardView(detail(), opts)[0].toJSON().accent_color).toBe(0xe2ae37)
  })

  // Labelled pairs, two lines: what the card is, then what it costs.
  it('labels each fact, tags on one line and stats on the next', () => {
    expect(textOf(view(detail()))).toContain(
      '## Nimbus 2000\n**Type** Item, Broom · **Lesson** Quidditch\n**Cost** 4 · **Rarity** Rare · **Legality** Legal\n',
    )
  })

  it('labels damage per turn', () => {
    expect(textOf(view(detail({ damage: 2 })))).toContain('**Cost** 4 · **Damage per turn** 2 · **Rarity** Rare')
  })

  it('leaves the stats line out when the card has no stats', () => {
    const t = textOf(view(detail({ cost: null, rarity: null, legality: null })))
    expect(t).toMatch(/^## Nimbus 2000\n\*\*Type\*\* Item, Broom · \*\*Lesson\*\* Quidditch\nWhenever/)
  })

  it('localizes the stats line and humanizes an untranslated sub-type', () => {
    expect(textOf(view(detail(), { locale: 'de' }))).toContain('**Typ** Gegenstand, Broom · **Lektion** Quidditch\n**Kosten** 4')
  })

  it('prefers a translated sub-type label', () => {
    const v = view(detail({ types: ['character'], subTypes: ['wizard', 'death_eater'] }, { subTypeLabels: { wizard: 'Wizard' } }))
    expect(textOf(v)).toContain('Character, Wizard, Death Eater')
  })

  // With its label, an unknown legality says something again, as the embed did.
  it('shows an unknown legality under its label', () => {
    expect(textOf(view(detail({ legality: 'unknown' })))).toContain('**Legality** Unknown')
  })

  it('drops what the card has no value for', () => {
    const t = textOf(view(detail({ cost: null, damage: null })))
    expect(t).not.toContain('Cost')
    expect(t).not.toContain('Damage per turn')
  })

  it('ends with the set and number as a footer line', () => {
    expect(textOf(view(detail()))).toContain('-# Base Set · #12')
  })

  it('lists rulings under a heading', () => {
    const v = view(detail({}, { rulings: [{ date: '2001-11-01', source: 'WotC', text: 'It stacks.' }] }))
    expect(textOf(v)).toContain('**Rulings**\n- 2001-11-01: It stacks.')
  })

  it('stays inside the text budget for a wordy card with many rulings', () => {
    const rulings = Array.from({ length: 30 }, (_, i) => ({ date: null, source: null, text: 'y'.repeat(200) + i }))
    const components = cardView(detail({ text: 'x'.repeat(5000), flavorText: 'z'.repeat(1000) }, { rulings }), opts)
    expect(measure(components).text).toBeLessThanOrEqual(MAX_TEXT)
  })

  it('puts the actions it is given ahead of the link button', () => {
    const back = new ButtonBuilder().setCustomId('v1:cb:1:-:-:-:q').setLabel('Back').setStyle(ButtonStyle.Secondary)
    const buttons = buttonsOf(view(detail(), { actions: [back] }))
    expect(buttons.map((b) => b.label)).toEqual(['Back', 'Open on revelio.cards'])
  })
})
