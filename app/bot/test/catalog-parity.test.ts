import { describe, it, expect } from 'vitest'
import { IntlMessageFormat } from 'intl-messageformat'
import en from '../src/i18n/en.json'
import de from '../src/i18n/de.json'

describe('bot message catalogs', () => {
  it('define the same keys in both locales', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort())
  })

  it('leave no value empty', () => {
    for (const [key, value] of Object.entries({ ...en, ...de })) {
      expect(value, key).not.toBe('')
    }
  })

  it('hold only messages that parse as ICU', () => {
    for (const [locale, catalog] of Object.entries({ en, de })) {
      for (const [key, value] of Object.entries(catalog)) {
        expect(() => new IntlMessageFormat(value, locale, undefined, { ignoreTag: true }), `${locale} ${key}`).not.toThrow()
      }
    }
  })
})
