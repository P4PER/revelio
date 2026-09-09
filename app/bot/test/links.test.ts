import { describe, it, expect } from 'vitest'
import { cardUrl, searchUrl } from '../src/links'

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
})
