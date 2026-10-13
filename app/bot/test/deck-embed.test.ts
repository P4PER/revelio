import { describe, it, expect } from 'vitest'
import { deckEmbed } from '../src/discord/embeds/deck-embed'
import type { DeckView } from '../src/data/decks'

const deck: DeckView = {
  id: 'abc123',
  name: 'Charms Aggro',
  format: 'classic',
  ownerUsername: 'seeker',
  character: { name: 'Harry Potter', quantity: 1, cost: null, lesson: null, setCode: 'BS', number: '1' },
  main: [
    { name: 'Charms Lesson', quantity: 8, cost: 0, lesson: 'charms', setCode: 'BS', number: '112' },
    { name: 'Alohomora', quantity: 4, cost: 2, lesson: 'charms', setCode: 'BS', number: '75' },
  ],
  sideboard: [{ name: 'Nimbus 2000', quantity: 2, cost: 4, lesson: 'quidditch', setCode: 'QC', number: '8' }],
  entries: [],
  mainCount: 12,
  sideboardCount: 2,
  topLesson: 'charms',
  status: 'incomplete',
}

const opts = { locale: 'en', siteBase: 'https://revelio.cards', view: 'list' } as const

describe('deckEmbed', () => {
  it('titles with the deck name and links to the deck page', () => {
    const json = deckEmbed(deck, opts).toJSON()
    expect(json.title).toBe('Charms Aggro')
    expect(json.url).toBe('https://revelio.cards/decks/abc123')
  })

  it('pads Format and Legality to a full row when there is no character', () => {
    const json = deckEmbed({ ...deck, character: null }, opts).toJSON()
    const inline = (json.fields ?? []).filter((f) => f.inline)
    expect(inline.map((f) => f.name)).toEqual(['Format', 'Legality', '\u200b'])
  })

  it('tints with the most-used lesson colour', () => {
    expect(deckEmbed(deck, opts).toJSON().color).toBe(0x0069a9)
  })

  it('lists the main deck as quantity-prefixed lines', () => {
    const field = deckEmbed(deck, opts).toJSON().fields?.find((f) => f.name.startsWith('Main deck'))
    expect(field?.name).toBe('Main deck (12)')
    expect(field?.value).toContain('8x Charms Lesson (BS 112)')
    expect(field?.value).toContain('4x Alohomora (BS 75)')
  })

  it('names the printing of each sideboard card too', () => {
    const field = deckEmbed(deck, opts).toJSON().fields?.find((f) => f.name.startsWith('Sideboard'))
    expect(field?.value).toBe('2x Nimbus 2000 (QC 8)')
  })

  it('leaves the printing off a card whose set and number did not resolve', () => {
    // getDeck falls back to empty strings when a card row is missing; "()" or
    // "( )" there would read as a rendering bug.
    const orphan = { name: 'Lost Card', quantity: 1, cost: 1, lesson: null, setCode: '', number: '' }
    const field = deckEmbed({ ...deck, sideboard: [orphan] }, opts).toJSON().fields
      ?.find((f) => f.name.startsWith('Sideboard'))
    expect(field?.value).toBe('1x Lost Card')
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

  it('counts the remainder in copies, the same unit as the field header', () => {
    // The header says "Main deck (400)", so "... and N more" has to be copies
    // too. Counting distinct entries there leaves two numbers in one field that
    // the reader cannot reconcile.
    const many = Array.from({ length: 200 }, (_, i) => ({
      name: `Card number ${i}`, quantity: 2, cost: i, lesson: 'charms', setCode: 'BS', number: String(i),
    }))
    const json = deckEmbed({ ...deck, main: many, mainCount: 400 }, opts).toJSON()
    const value = json.fields?.find((f) => f.name.startsWith('Main deck'))!.value
    const shown = value.split('\n').filter((l) => l.startsWith('2x')).length
    expect(value).toContain(`and ${400 - shown * 2} more`)
  })

  it('truncates a long card list with a remainder line, inside the 1024 limit', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({
      name: `Card number ${i}`, quantity: 1, cost: i, lesson: 'charms', setCode: 'BS', number: String(i),
    }))
    const json = deckEmbed({ ...deck, main: many, mainCount: 200 }, opts).toJSON()
    const field = json.fields?.find((f) => f.name.startsWith('Main deck'))
    if (!field) throw new Error('deckEmbed produced no Main deck field')
    expect(field.value.length).toBeLessThanOrEqual(1024)
    expect(field.value).toContain('and')
    expect(field.value).toContain('more')
  })

  it('sets no image on the list view', () => {
    expect(deckEmbed(deck, opts).toJSON().image).toBeUndefined()
  })
})

describe('deckEmbed image view', () => {
  const image = { ...opts, view: 'image', imageName: 'deck.png' } as const

  it('references the attachment it was told about', () => {
    expect(deckEmbed(deck, image).toJSON().image?.url).toBe('attachment://deck.png')
    // media.discordapp.net transcodes by extension, so the fallback's WebP has to
    // be referenced as a .webp or the inline image can come back broken.
    const webp = deckEmbed(deck, { ...image, imageName: 'deck.webp' })
    expect(webp.toJSON().image?.url).toBe('attachment://deck.webp')
  })

  // The picture already shows every card, so a list next to it is noise and
  // would push the image below a wall of text.
  it('leaves the card lists out', () => {
    const names = deckEmbed(deck, image).toJSON().fields?.map((f) => f.name) ?? []
    expect(names.some((n) => n.startsWith('Main deck') || n.startsWith('Sideboard'))).toBe(false)
  })

  it('keeps the shared header', () => {
    const json = deckEmbed(deck, image).toJSON()
    expect(json.title).toBe('Charms Aggro')
    expect(json.url).toBe('https://revelio.cards/decks/abc123')
    expect(json.footer?.text).toBe('by seeker')
    expect(json.fields?.map((f) => f.name)).toEqual(['Starting character', 'Format', 'Legality'])
  })
})
