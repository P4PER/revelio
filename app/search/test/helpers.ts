import { randomUUID } from 'node:crypto'
import { createMeiliClient } from '../src/client.js'

export function testMeiliClient() {
  const host = process.env.TEST_MEILI_HOST ?? 'http://localhost:7700'
  const apiKey = process.env.TEST_MEILI_KEY ?? 'masterKey'
  return createMeiliClient(host, apiKey)
}

// A unique "lang" so cardsIndex() yields a fresh, isolated index per test.
export function uniqueLang(): string {
  return `test${randomUUID().replace(/-/g, '')}`
}
