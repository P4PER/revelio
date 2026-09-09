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
})
