import { describe, it, expect } from 'vitest'
import { ButtonBuilder, ButtonStyle } from 'discord.js'
import { deckView, type DeckViewOptions } from '../src/discord/v2/deck-view'
import type { DeckView } from '../src/data/decks'
import { measure } from '../src/discord/v2/limits'
import { buttonsOf, flatten, mediaUrls, textOf } from './helpers/v2'

const deck: DeckView = {
  id: 'abc123',
  name: 'Charms Aggro',
  format: 'classic',
  ownerUsername: 'seeker',
  visibility: 'public',
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
const opts: DeckViewOptions = { locale: 'en', imageBase: 'https://img.test', siteBase: 'https://revelio.cards', linkPage: true }
const view = (d: DeckView = deck, o: Partial<DeckViewOptions> = {}) => ({ components: deckView(d, { ...opts, ...o }) })

describe('deckView', () => {
  // The starting character sits under the name, with its art beside the
  // heading; who, format and legality are one small line.
  it('heads with the name, the starting character and a small facts line', () => {
    expect(textOf(view())).toMatch(/^## Charms Aggro\n\*\*Harry Potter\*\*\n-# by @seeker · Classic · 🚧 Incomplete/)
  })

  it('shows the starting character\'s art beside the heading of the list view', () => {
    const withArt = { ...deck, entries: [{ cardId: 'bs-harry', zone: 'character', artCropVersion: 3 }] as never }
    expect(mediaUrls(view(withArt))).toEqual(['https://img.test/cards/art-crop/bs-harry.3.webp'])
    expect(mediaUrls(view())).toEqual([])
  })

  // The sheet already shows the starting character.
  it('leaves the art off when the sheet is shown', () => {
    const withArt = { ...deck, entries: [{ cardId: 'bs-harry', zone: 'character', artCropVersion: 3 }] as never }
    expect(mediaUrls(view(withArt, { imageName: 'deck.png' }))).toEqual(['attachment://deck.png'])
  })

  it('marks a legal and an illegal deck', () => {
    expect(textOf(view({ ...deck, status: 'legal' }))).toContain('✅ Legal')
    expect(textOf(view({ ...deck, status: 'illegal' }))).toContain('⛔ Illegal')
  })

  it('credits revelio.cards when the owner has no handle', () => {
    expect(textOf(view({ ...deck, ownerUsername: null }))).toContain('shared on revelio.cards')
  })

  it('tints the container with the top lesson', () => {
    expect(deckView(deck, opts)[0].toJSON().accent_color).toBe(0x0069a9)
  })

  it('lists each zone with the printing of every card', () => {
    const t = textOf(view())
    expect(t).toContain('**Main deck (12)**\n8x Charms Lesson (BS 112)\n4x Alohomora (BS 75)')
    expect(t).toContain('**Sideboard (2)**\n2x Nimbus 2000 (QC 8)')
  })

  it('shows the sheet instead of the lists when it has one', () => {
    const v = view(deck, { imageName: 'deck.webp' })
    expect(mediaUrls(v)).toEqual(['attachment://deck.webp'])
    expect(textOf(v)).not.toContain('Main deck')
  })

  it('links the deck page only when allowed', () => {
    expect(buttonsOf(view()).find((b) => b.url)?.url).toBe('https://revelio.cards/decks/abc123')
    expect(buttonsOf(view(deck, { linkPage: false }))).toHaveLength(0)
  })

  it('puts a lead line first and actions ahead of the link', () => {
    const back = new ButtonBuilder().setCustomId('v1:d:p:1:-:0:-:').setLabel('Back').setStyle(ButtonStyle.Secondary)
    const v = view(deck, { lead: '<@1> shared a deck.', actions: [back] })
    expect(textOf(v)).toMatch(/^<@1> shared a deck\.\n## Charms Aggro/)
    expect(buttonsOf(v).map((b) => b.label)).toEqual(['Back', 'Open on revelio.cards'])
  })

  it('renders a hostile deck name as text, not as a link', () => {
    const t = textOf(view({ ...deck, name: '[Click me](https://evil.example)', ownerUsername: '**boss**' }))
    expect(t).toContain('## \\[Click me\\]\\(https://evil.example\\)')
    expect(t).toContain('by @\\*\\*boss\\*\\*')
  })

  it('stays inside the text budget for a legacy over-long name', () => {
    const main = Array.from({ length: 120 }, (_, i) => ({
      name: `A long card name number ${i}`, quantity: 1, cost: i, lesson: null, setCode: 'BS', number: String(i),
    }))
    const big = { ...deck, name: '*'.repeat(1500), main, sideboard: main, mainCount: 120, sideboardCount: 120 }
    expect(measure(view(big).components).text).toBeLessThanOrEqual(4000)
  })

  // Discord caps a media description at 1024 characters; a legacy name past
  // that would fail the whole post.
  it('clamps a legacy over-long name in the sheet description', () => {
    const descs = flatten(view({ ...deck, name: 'x'.repeat(1500) }, { imageName: 'deck.png' }))
      .flatMap((n) => (n.items ?? []).map((i) => i.description ?? ''))
    expect(descs).toHaveLength(1)
    expect(descs[0].length).toBeLessThanOrEqual(120)
  })

  it('stays inside the text budget for a huge deck, saying how many it left out', () => {
    const main = Array.from({ length: 120 }, (_, i) => ({
      name: `A long card name number ${i}`, quantity: 1, cost: i, lesson: null, setCode: 'BS', number: String(i),
    }))
    const big = { ...deck, main, sideboard: main, mainCount: 120, sideboardCount: 120 }
    const v = view(big)
    expect(measure(v.components).text).toBeLessThanOrEqual(4000)
    expect(textOf(v)).toMatch(/\.\.\. and \d+ more/)
  })
})
