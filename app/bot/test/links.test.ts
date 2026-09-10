import { describe, it, expect } from 'vitest'
import { cardUrl, deckUrl, searchUrl, settingsUrl, newDeckUrl } from '../src/links'

describe('cardUrl', () => {
  it('omits the locale prefix for English', () => {
    expect(cardUrl('https://revelio.cards', 'base-12', 'en'))
      .toBe('https://revelio.cards/card/base-12')
  })

  it('prefixes non-default locales', () => {
    expect(cardUrl('https://revelio.cards', 'base-12', 'de'))
      .toBe('https://revelio.cards/de/card/base-12')
  })

  it('tolerates a trailing slash on the base', () => {
    expect(cardUrl('https://revelio.cards/', 'base-12', 'en'))
      .toBe('https://revelio.cards/card/base-12')
  })
})

describe('searchUrl', () => {
  it('encodes the query', () => {
    expect(searchUrl('https://revelio.cards', 'harry potter', 'en'))
      .toBe('https://revelio.cards/search?q=harry+potter')
  })

  it('prefixes non-default locales', () => {
    expect(searchUrl('https://revelio.cards', 'nimbus', 'de'))
      .toBe('https://revelio.cards/de/search?q=nimbus')
  })

  it('carries the applied filters so the link matches the embed', () => {
    // web/src/lib/search-params.ts reads repeated `lesson` and `type` params.
    expect(searchUrl('https://revelio.cards', 'nimbus', 'en', { lesson: 'charms', type: 'item' }))
      .toBe('https://revelio.cards/search?q=nimbus&lesson=charms&type=item')
  })

  it('carries the chosen set, which web reads as a single param', () => {
    expect(searchUrl('https://revelio.cards', 'nimbus', 'en', { set: 'base' }))
      .toBe('https://revelio.cards/search?q=nimbus&set=base')
  })

  it('omits filters that were not applied', () => {
    expect(searchUrl('https://revelio.cards', 'nimbus', 'en', {}))
      .toBe('https://revelio.cards/search?q=nimbus')
  })
})

describe('deckUrl', () => {
  it('omits the locale prefix for English', () => {
    expect(deckUrl('https://revelio.cards', 'abc123', 'en'))
      .toBe('https://revelio.cards/decks/abc123')
  })

  it('prefixes non-default locales', () => {
    expect(deckUrl('https://revelio.cards', 'abc123', 'de'))
      .toBe('https://revelio.cards/de/decks/abc123')
  })
})

describe('settingsUrl', () => {
  it('omits the locale prefix for English', () => {
    expect(settingsUrl('https://revelio.cards', 'en'))
      .toBe('https://revelio.cards/settings/connections')
  })

  it('prefixes non-default locales', () => {
    expect(settingsUrl('https://revelio.cards', 'de'))
      .toBe('https://revelio.cards/de/settings/connections')
  })
})

describe('newDeckUrl', () => {
  it('omits the locale prefix for English', () => {
    expect(newDeckUrl('https://revelio.cards', 'en'))
      .toBe('https://revelio.cards/decks/new')
  })

  it('prefixes non-default locales', () => {
    expect(newDeckUrl('https://revelio.cards', 'de'))
      .toBe('https://revelio.cards/de/decks/new')
  })
})
