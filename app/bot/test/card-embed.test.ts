import { describe, it, expect } from 'vitest'
import type { SearchDocument } from '@revelio/search'
import { cardEmbed } from '../src/discord/embeds/card-embed'

const doc: SearchDocument = {
  id: 'base-12',
  setCode: 'base',
  number: '12',
  numberSort: '0:000012',
  name: 'Nimbus 2000',
  text: 'Whenever you play a Quidditch card, draw a card.',
  flavorText: 'The fastest broom on the market.',
  types: ['item'],
  subTypes: ['broom'],
  lesson: 'quidditch',
  rarity: 'rare',
  finishes: ['normal'],
  legality: 'legal',
  cost: 4,
  damage: null,
  isOfficial: true,
  imageLang: 'en',
  imageVersion: 3,
  artCropVersion: null,
  defaultLanguage: 'en',
  orientation: null,
}

const opts = {
  locale: 'en',
  setName: 'Base Set',
  imageBase: 'https://img.revelio.cards',
  siteBase: 'https://revelio.cards',
  rulings: [],
  subTypeLabels: {},
}

describe('cardEmbed', () => {
  it('titles the embed with the card name and links to the card page', () => {
    const json = cardEmbed(doc, opts).toJSON()
    expect(json.title).toBe('Nimbus 2000')
    expect(json.url).toBe('https://revelio.cards/card/base-12')
  })

  it('shows the 300px thumb as the large image, not the full image', () => {
    const json = cardEmbed(doc, opts).toJSON()
    expect(json.image?.url).toBe('https://img.revelio.cards/cards/thumb/base-12.3.webp')
    expect(json.thumbnail).toBeUndefined()
  })

  it('shows a horizontal card upright through its landscape thumb', () => {
    const json = cardEmbed({ ...doc, orientation: 'horizontal', imageLang: 'de' }, opts).toJSON()
    expect(json.image?.url).toBe('https://img.revelio.cards/cards/landscape-thumb/base-12.de.3.webp')
  })

  it('omits the image when the card has no image', () => {
    const json = cardEmbed({ ...doc, imageLang: null, imageVersion: null }, opts).toJSON()
    expect(json.image).toBeUndefined()
  })

  it('tints the embed with the lesson colour', () => {
    const json = cardEmbed(doc, opts).toJSON()
    expect(json.color).toBe(0xe2ae37)
  })

  it('renders localized attribute labels', () => {
    const en = cardEmbed(doc, opts).toJSON()
    expect(en.fields?.find((f) => f.name === 'Lesson')?.value).toBe('Quidditch')
    const de = cardEmbed(doc, { ...opts, locale: 'de', setName: 'Basis-Set' }).toJSON()
    // Curated types are localized; an untranslated sub-type is humanized.
    expect(de.fields?.find((f) => f.name === 'Typ')?.value).toBe('Gegenstand, Broom')
  })

  it('prefers a translated sub-type label and humanizes the rest', () => {
    const json = cardEmbed(
      { ...doc, types: ['character'], subTypes: ['wizard', 'death_eater'] },
      { ...opts, subTypeLabels: { wizard: 'Wizard' } },
    ).toJSON()
    expect(json.fields?.find((f) => f.name === 'Type')?.value).toBe('Character, Wizard, Death Eater')
  })

  it('puts the set name and card number in the footer', () => {
    const json = cardEmbed(doc, opts).toJSON()
    expect(json.footer?.text).toBe('Base Set · #12')
  })

  it('omits a field the card has no value for', () => {
    const json = cardEmbed({ ...doc, cost: null, damage: null }, opts).toJSON()
    expect(json.fields?.some((f) => f.name === 'Cost')).toBe(false)
    expect(json.fields?.some((f) => f.name === 'Damage per turn')).toBe(false)
  })

  it('renders rulings when present', () => {
    const json = cardEmbed(doc, {
      ...opts,
      rulings: [{ date: '2001-11-01', source: 'WotC', text: 'It stacks.' }],
    }).toJSON()
    expect(json.fields?.find((f) => f.name === 'Rulings')?.value).toContain('It stacks.')
  })

  it('keeps the description inside Discord\'s 4096 character limit', () => {
    const long = 'x'.repeat(5000)
    const json = cardEmbed({ ...doc, text: long }, opts).toJSON()
    expect((json.description ?? '').length).toBeLessThanOrEqual(4096)
  })

  it('keeps every field value inside Discord\'s 1024 character limit', () => {
    const rulings = Array.from({ length: 30 }, (_, i) => ({
      date: null, source: null, text: 'y'.repeat(200) + i,
    }))
    const json = cardEmbed(doc, { ...opts, rulings }).toJSON()
    for (const field of json.fields ?? []) {
      expect(field.value.length).toBeLessThanOrEqual(1024)
    }
  })
})
