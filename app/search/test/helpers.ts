import { randomUUID } from 'node:crypto'
import { createMeiliClient } from '../src/client.js'

export function testMeiliHost(): string {
  return process.env.TEST_MEILI_HOST ?? 'http://localhost:7700'
}

export function testMeiliClient() {
  const apiKey = process.env.TEST_MEILI_KEY ?? 'masterKey'
  return createMeiliClient(testMeiliHost(), apiKey)
}

// A unique "lang" so cardsIndex() yields a fresh, isolated index per test.
export function uniqueLang(): string {
  return `test${randomUUID().replace(/-/g, '')}`
}
