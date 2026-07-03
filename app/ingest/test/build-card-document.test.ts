import { describe, it, expect } from 'vitest'
import { buildCardDocument, type CardIndexData } from '@revelio/search'

const base: CardIndexData = {
  id: 'x-1', setCode: 'X', setName: 'Xen', number: '1', name: 'Fallback',
  lesson: 'creatures', lessonColor: '#123456', rarity: 'common', finish: null,
  legality: null, cost: 2, isOfficial: true, types: ['spell'], subTypes: [],
  defaultLanguage: 'en',
  localizations: {
    en: { name: 'Wizard Crackers', text: 'Reveal the top card.', flavorText: 'Bang!', imageFile: 'x-1.png' },
  },
}

describe('buildCardDocument', () => {
  it('uses the localization for the requested language', () => {
    const doc = buildCardDocument(base, 'en')
    expect(doc.name).toBe('Wizard Crackers')
    expect(doc.text).toBe('Reveal the top card.')
    expect(doc.lessonColor).toBe('#123456')
    expect(doc.isOfficial).toBe(true)
  })
  it('falls back to the default language when the requested one is missing', () => {
    const doc = buildCardDocument(base, 'de')
    expect(doc.name).toBe('Wizard Crackers') // en is default
  })
  it('nulls lessonColor when there is no lesson', () => {
    const doc = buildCardDocument({ ...base, lesson: null }, 'en')
    expect(doc.lessonColor).toBeNull()
  })
})
