import { describe, it, expect } from 'vitest'
import { TYPES, LESSONS, RARITIES, FINISHES, LEGALITIES, VOCAB } from '../src/vocab.js'
import { vocabEntrySchema, lessonEntrySchema } from '../src/schemas.js'

describe('vocab config', () => {
  it('every lesson has a valid #RRGGBB color and a unique code', () => {
    for (const l of LESSONS) expect(() => lessonEntrySchema.parse(l)).not.toThrow()
    const codes = LESSONS.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('plain vocab entries validate', () => {
    for (const e of [...TYPES, ...RARITIES, ...FINISHES, ...LEGALITIES]) {
      expect(() => vocabEntrySchema.parse(e)).not.toThrow()
    }
  })

  it('VOCAB groups the five curated vocabularies', () => {
    expect(Object.keys(VOCAB).sort()).toEqual(
      ['finishes', 'legalities', 'lessons', 'rarities', 'types'],
    )
  })
})
