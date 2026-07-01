import { describe, it, expect } from 'vitest'
import { TYPES, LESSONS, RARITIES, FINISHES, LEGALITIES, VOCAB, slugify } from '../src/vocab.js'
import { vocabMetaSchema, lessonMetaSchema } from '../src/schemas.js'

describe('vocab config', () => {
  it('every lesson has a valid #RRGGBB color and a unique code', () => {
    for (const l of LESSONS) expect(() => lessonMetaSchema.parse(l)).not.toThrow()
    const codes = LESSONS.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('plain vocab entries validate', () => {
    for (const e of [...TYPES, ...RARITIES, ...FINISHES, ...LEGALITIES]) {
      expect(() => vocabMetaSchema.parse(e)).not.toThrow()
    }
  })

  it('VOCAB groups the five curated vocabularies', () => {
    expect(Object.keys(VOCAB).sort()).toEqual(
      ['finishes', 'legalities', 'lessons', 'rarities', 'types'],
    )
  })

  it('locks the curated vocabulary counts', () => {
    expect(TYPES).toHaveLength(9)
    expect(LESSONS).toHaveLength(5)
    expect(RARITIES).toHaveLength(4)
    expect(FINISHES).toHaveLength(3)
    expect(LEGALITIES).toHaveLength(4)
  })

  it('slugify normalizes source strings to snake_case slugs', () => {
    expect(slugify('Care of Magical Creatures')).toBe('care_of_magical_creatures')
    expect(slugify('Character')).toBe('character')
    expect(slugify('normal')).toBe('normal')
  })
})
