import { it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { generateCode, matchStoredCode } from '../account-codes'

const stored = (code: string, extra: Record<string, string> = {}) =>
  JSON.stringify({ codeHash: createHash('sha256').update(code).digest('hex'), ...extra })

it('generates a 6-digit numeric code', () => {
  for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^[0-9]{6}$/)
})

it('matches a correct code and returns extra fields', () => {
  expect(matchStoredCode('123456', stored('123456', { newEmail: 'a@b.c' }))).toEqual({ newEmail: 'a@b.c' })
})

it('rejects a wrong code', () => {
  expect(matchStoredCode('000000', stored('123456'))).toBeNull()
})

it('rejects malformed stored value', () => {
  expect(matchStoredCode('123456', 'not json')).toBeNull()
})
