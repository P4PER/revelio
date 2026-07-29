import { describe, it, expect } from 'vitest'
import { OG_SIZE, OG_CONTENT_TYPE } from '../seo'

describe('og image contract', () => {
  it('routes advertise a 1200x630 PNG', () => {
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 })
    expect(OG_CONTENT_TYPE).toBe('image/png')
  })
})
