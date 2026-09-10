import { describe, it, expect } from 'vitest'
import { deckEmbed } from '../src/discord/embeds/deck-embed'
import type { PublicDeck } from '../src/data/decks'

const deck: PublicDeck = {
  id: 'abc123',
  name: 'Charms Aggro',
  format: 'classic',
  ownerUsername: 'seeker',
  character: { name: 'Harry Potter', quantity: 1, cost: null, lesson: null },
  main: [
    { name: 'Charms Lesson', quantity: 8, cost: 0, lesson: 'charms' },
    { name: 'Alohomora', quantity: 4, cost: 2, lesson: 'charms' },
  ],
  sideboard: [{ name: 'Nimbus 2000', quantity: 2, cost: 4, lesson: 'quidditch' }],
  mainCount: 12,
  sideboardCount: 2,
  topLesson: 'charms',
  status: 'incomplete',
}

const opts = { locale: 'en', siteBase: 'https://revelio.cards' }

describe('deckEmbed', () => {
  it('titles with the deck name and links to the deck page', () => {
    const json = deckEmbed(deck, opts).toJSON()
    expect(json.title).toBe('Charms Aggro')
    expect(json.url).toBe('https://revelio.cards/decks/abc123')
  })

  it('tints with the most-used lesson colour', () => {
    expect(deckEmbed(deck, opts).toJSON().color).toBe(0x0069a9)
  })

  it('lists the main deck as quantity-prefixed lines', () => {
    const field = deckEmbed(deck, opts).toJSON().fields?.find((f) => f.name.startsWith('Main deck'))
    expect(field?.name).toBe('Main deck (12)')
    expect(field?.value).toContain('8x Charms Lesson')
    expect(field?.value).toContain('4x Alohomora')
  })

  it('shows the starting character', () => {
    const json = deckEmbed(deck, opts).toJSON()
    expect(json.fields?.find((f) => f.name === 'Starting character')?.value).toBe('Harry Potter')
  })

  it('omits the sideboard field when the sideboard is empty', () => {
    const json = deckEmbed({ ...deck, sideboard: [], sideboardCount: 0 }, opts).toJSON()
    expect(json.fields?.some((f) => f.name.startsWith('Sideboard'))).toBe(false)
  })

  it('localizes the format and legality', () => {
    const json = deckEmbed(deck, { ...opts, locale: 'de' }).toJSON()
    expect(json.fields?.find((f) => f.name === 'Legalität')?.value).toBe('Unvollständig')
  })

  it('credits the owner in the footer, or says shared when anonymous', () => {
    expect(deckEmbed(deck, opts).toJSON().footer?.text).toBe('by seeker')
    expect(deckEmbed({ ...deck, ownerUsername: null }, opts).toJSON().footer?.text)
      .toBe('shared on revelio.cards')
  })

  it('truncates a long card list with a remainder line, inside the 1024 limit', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      name: `Card number ${i}`, quantity: 1, cost: i, lesson: 'charms',
    }))
    const json = deckEmbed({ ...deck, main: many, mainCount: 200 }, opts).toJSON()
    const field = json.fields?.find((f) => f.name.startsWith('Main deck'))!
    expect(field.value.length).toBeLessThanOrEqual(1024)
    expect(field.value).toContain('and')
    expect(field.value).toContain('more')
  })
})
