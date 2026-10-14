import { it, expect } from 'vitest'
import { makeUsernameSchema, makeNewEmailSchema } from '../schemas/settings'

const t = (k: string) => k

it('accepts a valid username and trims it', () => {
  const parsed = makeUsernameSchema(t).safeParse({ username: '  alice ' })
  expect(parsed.success && parsed.data.username).toBe('alice')
})
it('rejects an empty username', () => {
  expect(makeUsernameSchema(t).safeParse({ username: '   ' }).success).toBe(false)
})
it('rejects an invalid email', () => {
  expect(makeNewEmailSchema(t).safeParse({ email: 'nope' }).success).toBe(false)
})
it('accepts a valid email', () => {
  expect(makeNewEmailSchema(t).safeParse({ email: 'a@b.co' }).success).toBe(true)
})
