import { describe, it, expect } from 'vitest'
import { attrLabel } from '../src/labels'
import { TYPES, LESSONS, RARITIES, FINISHES, LEGALITIES } from '../src/attributes'

describe('attrLabel', () => {
  it('resolves English labels by code', () => {
    expect(attrLabel('lessons', 'charms', 'en')).toBe('Charms')
    expect(attrLabel('rarities', 'rare', 'en')).toBe('Rare')
  })

  it('resolves German labels by code', () => {
    expect(attrLabel('lessons', 'charms', 'de')).toBe('Zauberkunst')
    expect(attrLabel('types', 'creature', 'de')).toBe('Kreatur')
  })

  it('resolves legalities', () => {
    expect(attrLabel('legalities', 'banned', 'en')).toBe('Banned')
    expect(attrLabel('legalities', 'banned', 'de')).toBe('Verboten')
  })

  it('falls back to English for an unknown locale', () => {
    expect(attrLabel('finishes', 'foil', 'fr')).toBe('Foil')
  })

  it('falls back to the code for an unknown key', () => {
    expect(attrLabel('lessons', 'nope', 'en')).toBe('nope')
  })

  it('covers every curated attribute code in both locales', () => {
    const scopes = [
      ['types', TYPES], ['lessons', LESSONS], ['rarities', RARITIES],
      ['finishes', FINISHES], ['legalities', LEGALITIES],
    ] as const
    for (const [scope, metas] of scopes) {
      for (const m of metas) {
        for (const locale of ['en', 'de']) {
          expect(attrLabel(scope, m.code, locale), `${locale}/${scope}/${m.code}`)
            .not.toBe(m.code)
        }
      }
    }
  })
})
