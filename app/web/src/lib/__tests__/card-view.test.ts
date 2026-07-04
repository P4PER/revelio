import { describe, it, expect } from 'vitest'
import { pickLocalization } from '../card-view'
import type { CardDetailDTO } from '@revelio/core'

const base = {
  en: { lang: 'en', name: 'Fluffy', status: 'official', source: null, text: 'EN', flavorText: null, imageFile: null, imageUrl: null },
  de: { lang: 'de', name: 'Fluffy', status: 'machine', source: null, text: 'DE', flavorText: null, imageFile: null, imageUrl: null },
}
const card = (locs: object, def = 'en') => ({ defaultLanguage: def, localizations: locs } as unknown as CardDetailDTO)

describe('pickLocalization', () => {
  it('returns the requested locale when present', () => {
    const { loc, isFallback } = pickLocalization(card(base), 'de')
    expect(loc.text).toBe('DE')
    expect(isFallback).toBe(false)
  })
  it('falls back to defaultLanguage when the locale is missing', () => {
    const { loc, isFallback } = pickLocalization(card({ en: base.en }), 'de')
    expect(loc.text).toBe('EN')
    expect(isFallback).toBe(true)
  })
  it('treats an empty-name (image-only) localization as fallback', () => {
    const imageOnly = { ...base.en, lang: 'de', name: '', text: null, imageFile: 'art.png' }
    const { loc, isFallback } = pickLocalization(card({ en: base.en, de: imageOnly }), 'de')
    expect(loc.text).toBe('EN')
    expect(isFallback).toBe(true)
  })
  it('falls back to the first available localization when neither locale nor default exist', () => {
    const { loc, isFallback } = pickLocalization(card({ fr: { ...base.en, lang: 'fr', text: 'FR' } }, 'en'), 'de')
    expect(loc?.text).toBe('FR')
    expect(isFallback).toBe(true)
  })
})
