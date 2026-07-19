import { describe, it, expect } from 'vitest'
import { imageKey, thumbKey, symbolKey, imageUrl, artCropKey, effectiveImageLang } from '../src/images.js'

describe('image keys and urls', () => {
  it('builds versioned object keys', () => {
    expect(imageKey('bs-1-dean-thomas', 1721380000)).toBe('cards/bs-1-dean-thomas.1721380000.webp')
    expect(thumbKey('bs-1-dean-thomas', 1721380000)).toBe('cards/thumb/bs-1-dean-thomas.1721380000.webp')
    expect(symbolKey('BS', 1721380000)).toBe('symbols/BS.1721380000.webp')
    expect(artCropKey('bs-1-dean-thomas', 1721380000)).toBe('cards/art-crop/bs-1-dean-thomas.1721380000.webp')
  })

  it('joins base and key with a single slash', () => {
    expect(imageUrl('https://img.example.com', 'cards/x.png')).toBe('https://img.example.com/cards/x.png')
    expect(imageUrl('https://img.example.com/', 'cards/x.png')).toBe('https://img.example.com/cards/x.png')
  })
})

describe('language-aware versioned keys', () => {
  it('uses the shared key for the default language, a suffixed key otherwise', () => {
    expect(imageKey('x-1', 5, 'en', 'en')).toBe('cards/x-1.5.webp')
    expect(imageKey('x-1', 5, 'de', 'en')).toBe('cards/x-1.de.5.webp')
    expect(thumbKey('x-1', 5, 'en', 'en')).toBe('cards/thumb/x-1.5.webp')
    expect(thumbKey('x-1', 5, 'de', 'en')).toBe('cards/thumb/x-1.de.5.webp')
  })

  it('resolves the effective image language with fallback', () => {
    const has = (set: string[]) => (l: string) => set.includes(l)
    expect(effectiveImageLang(has(['de']), 'de', 'en')).toBe('de')
    expect(effectiveImageLang(has(['en']), 'de', 'en')).toBe('en')
    expect(effectiveImageLang(has([]), 'de', 'en')).toBeNull()
  })
})
