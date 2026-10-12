import { describe, it, expect } from 'vitest'
import { CARD_NAME_MAX } from '@revelio/core'
import { makeLocalizationSchema } from '../schemas/localization'

const schema = makeLocalizationSchema((k) => k)

describe('makeLocalizationSchema', () => {
  it('accepts a name at the bound', () => {
    expect(schema.safeParse({ name: 'x'.repeat(CARD_NAME_MAX) }).success).toBe(true)
  })
  it('reports a name past the bound as too long', () => {
    const res = schema.safeParse({ name: 'x'.repeat(CARD_NAME_MAX + 1) })
    expect(res.success).toBe(false)
    expect(res.error?.issues[0]?.message).toBe('tooLong')
  })
})
