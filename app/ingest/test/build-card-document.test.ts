import { describe, it, expect } from 'vitest'
import { buildCardDocument, type CardIndexData } from '@revelio/search'

const base: CardIndexData = {
  id: 'x-1', setCode: 'X', number: '1', name: 'Fallback',
  lesson: 'creatures', rarity: 'common', finish: null,
  legality: null, cost: 2, isOfficial: true, types: ['spell'], subTypes: [],
  defaultLanguage: 'en',
  localizations: {
    en: { name: 'Wizard Crackers', text: 'Reveal the top card.', flavorText: 'Bang!', imageFile: 'x-1.png' },
  },
}

describe('buildCardDocument', () => {
  it('falls back to the card name when a localization has an empty (image-only) name', () => {
    const data = { ...base, localizations: { ...base.localizations,
      de: { name: '', text: null, flavorText: null, imageFile: 'art.png' } } }
    const doc = buildCardDocument(data as typeof base, 'de')
    expect(doc.name).toBe('Fallback')
    expect(doc.imageLang).toBe('de')
  })

  it('uses the localization for the requested language', () => {
    const doc = buildCardDocument(base, 'en')
    expect(doc.name).toBe('Wizard Crackers')
    expect(doc.text).toBe('Reveal the top card.')
    expect(doc.isOfficial).toBe(true)
  })
  it('falls back to the default language when the requested one is missing', () => {
    const doc = buildCardDocument(base, 'de')
    expect(doc.name).toBe('Wizard Crackers') // en is default
  })
  it('resolves imageLang with fallback and carries defaultLanguage', () => {
    const base = {
      id: 'x-1', setCode: 'X', number: '1', name: 'N',
      lesson: null, rarity: null, finish: null, legality: null,
      cost: null, isOfficial: true, types: [], subTypes: [], defaultLanguage: 'en',
    }
    // en has an image, de does not
    const data = { ...base, localizations: {
      en: { name: 'N', text: null, flavorText: null, imageFile: 'art.png' },
      de: { name: 'N', text: null, flavorText: null, imageFile: null },
    } }
    expect(buildCardDocument(data, 'en').imageLang).toBe('en')
    expect(buildCardDocument(data, 'de').imageLang).toBe('en') // falls back
    expect(buildCardDocument(data, 'de').defaultLanguage).toBe('en')
    const noImg = { ...base, localizations: { en: { name: 'N', text: null, flavorText: null, imageFile: null } } }
    expect(buildCardDocument(noImg, 'en').imageLang).toBeNull()
  })
})
