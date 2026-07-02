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
})
