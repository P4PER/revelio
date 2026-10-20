import { describe, it, expect } from 'vitest'
import { toRevelioLocale } from '../src/i18n/locale'
import { t } from '../src/i18n/t'

describe('toRevelioLocale', () => {
  it('maps a supported base language', () => {
    expect(toRevelioLocale('de')).toBe('de')
    expect(toRevelioLocale('en-US')).toBe('en')
    expect(toRevelioLocale('en-GB')).toBe('en')
  })

  it('falls back to English for anything else', () => {
    expect(toRevelioLocale('fr')).toBe('en')
    expect(toRevelioLocale(null)).toBe('en')
    expect(toRevelioLocale(undefined)).toBe('en')
  })
})

describe('t', () => {
  it('resolves a key in the requested locale', () => {
    expect(t('en', 'card.notFound', { name: 'Nimbus' }))
      .toBe('No card matched "Nimbus".')
    expect(t('de', 'card.notFound', { name: 'Nimbus' }))
      .toBe('Keine Karte passt zu "Nimbus".')
  })

  it('falls back to English for an unknown locale', () => {
    expect(t('fr', 'card.notFound', { name: 'x' })).toBe('No card matched "x".')
  })

  it('returns the key itself when it is missing everywhere', () => {
    expect(t('en', 'nope.nope')).toBe('nope.nope')
  })

  it('leaves an unsupplied placeholder visible rather than printing undefined', () => {
    expect(t('en', 'card.notFound')).toBe('No card matched "{name}".')
  })

  it('picks the singular for a count of one', () => {
    expect(t('en', 'decks.row.stats', { likes: 1, cards: 1 })).toBe('1 like · 1 card')
    expect(t('de', 'decks.row.stats', { likes: 1, cards: 1 })).toBe('1 Like · 1 Karte')
  })

  it('picks the plural for any other count', () => {
    expect(t('en', 'decks.row.stats', { likes: 0, cards: 60 })).toBe('0 likes · 60 cards')
    expect(t('de', 'decks.row.stats', { likes: 2, cards: 60 })).toBe('2 Likes · 60 Karten')
  })

  it('agrees the copies count in the collection summary', () => {
    const vars = { owned: 1, total: 1200, percent: 0.1, copies: 1 }
    expect(t('en', 'collection.summary', vars))
      .toBe('You own **1** of **1200** cards (0.1%), **1** copy in total.')
    expect(t('de', 'collection.summary', vars))
      .toBe('Du besitzt **1** von **1200** Karten (0.1%), insgesamt **1** Exemplar.')
  })

  it('leaves an unsupplied placeholder visible beside a plural', () => {
    expect(t('en', 'decks.row.stats', { likes: 1 })).toBe('1 like · {cards}')
  })
})
