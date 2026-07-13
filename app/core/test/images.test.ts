import { describe, it, expect } from 'vitest'
import { imageKey, thumbKey, symbolKey, imageUrl, artCropKey } from '../src/images.js'
import { effectiveImageLang } from '../src/images.js'

describe('image keys and urls', () => {
  it('builds object keys', () => {
    expect(imageKey('bs-1-dean-thomas')).toBe('cards/bs-1-dean-thomas.webp')
    expect(thumbKey('bs-1-dean-thomas')).toBe('cards/thumb/bs-1-dean-thomas.webp')
    expect(symbolKey('BS')).toBe('symbols/BS.webp')
    expect(artCropKey('bs-1-dean-thomas')).toBe('cards/art-crop/bs-1-dean-thomas.webp')
  })

  it('joins base and key with a single slash', () => {
    expect(imageUrl('https://img.example.com', 'cards/x.png')).toBe('https://img.example.com/cards/x.png')
    expect(imageUrl('https://img.example.com/', 'cards/x.png')).toBe('https://img.example.com/cards/x.png')
  })
})

describe('language-aware keys', () => {
  it('uses the shared key for the default language, a suffixed key otherwise', () => {
    expect(imageKey('x-1', 'en', 'en')).toBe('cards/x-1.webp')
    expect(imageKey('x-1', 'de', 'en')).toBe('cards/x-1.de.webp')
    expect(thumbKey('x-1', 'en', 'en')).toBe('cards/thumb/x-1.webp')
    expect(thumbKey('x-1', 'de', 'en')).toBe('cards/thumb/x-1.de.webp')
    expect(imageKey('x-1')).toBe('cards/x-1.webp') // 1-arg back-compat
  })

  it('resolves the effective image language with fallback', () => {
    const has = (set: string[]) => (l: string) => set.includes(l)
    expect(effectiveImageLang(has(['de']), 'de', 'en')).toBe('de')
    expect(effectiveImageLang(has(['en']), 'de', 'en')).toBe('en')
    expect(effectiveImageLang(has([]), 'de', 'en')).toBeNull()
  })
})
