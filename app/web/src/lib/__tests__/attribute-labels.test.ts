import { describe, it, expect } from 'vitest'
import { attrLabel } from '../attribute-labels'

describe('attrLabel', () => {
  it('resolves English labels by code', () => {
    expect(attrLabel('lessons', 'charms', 'en')).toBe('Charms')
    expect(attrLabel('rarities', 'rare', 'en')).toBe('Rare')
  })

  it('resolves German labels by code', () => {
    expect(attrLabel('lessons', 'charms', 'de')).toBe('Zauberkunst')
    expect(attrLabel('types', 'creature', 'de')).toBe('Kreatur')
  })

  it('resolves legalities (formerly humanized)', () => {
    expect(attrLabel('legalities', 'banned', 'en')).toBe('Banned')
    expect(attrLabel('legalities', 'banned', 'de')).toBe('Verboten')
  })

  it('falls back to English for an unknown locale', () => {
    expect(attrLabel('finishes', 'foil', 'fr')).toBe('Foil')
  })

  it('falls back to the code for an unknown key', () => {
    expect(attrLabel('lessons', 'nope', 'en')).toBe('nope')
  })
})
