import { describe, it, expect } from 'vitest'
import { makeContactSchema, CONTACT_LIMITS } from '../schemas/contact'

// Identity resolver: assert on the raw message keys the schema requests.
const schema = makeContactSchema((k) => k)

const valid = {
  name: 'Hermione',
  email: 'hermione@example.com',
  subject: 'Card data typo',
  message: 'The Lumos card has the wrong lesson cost listed.',
}

describe('makeContactSchema', () => {
  it('accepts a well-formed submission', () => {
    expect(schema.safeParse(valid).success).toBe(true)
  })

  it('passes honeypot + timing fields through without failing validation', () => {
    const res = schema.safeParse({ ...valid, website: 'http://spam', renderedAt: '123' })
    expect(res.success).toBe(true)
  })

  it('rejects an empty name with `required`', () => {
    const res = schema.safeParse({ ...valid, name: '   ' })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.issues[0].message).toBe('required')
  })

  it('rejects an invalid email with `email`', () => {
    const res = schema.safeParse({ ...valid, email: 'not-an-email' })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.issues[0].message).toBe('email')
  })

  it('rejects a too-short message with `messageTooShort`', () => {
    const res = schema.safeParse({ ...valid, message: 'too short' })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.issues[0].message).toBe('messageTooShort')
  })

  it('rejects an over-long subject with `tooLong`', () => {
    const res = schema.safeParse({ ...valid, subject: 'x'.repeat(CONTACT_LIMITS.SUBJECT_MAX + 1) })
    expect(res.success).toBe(false)
    if (!res.success) expect(res.error.issues[0].message).toBe('tooLong')
  })
})
