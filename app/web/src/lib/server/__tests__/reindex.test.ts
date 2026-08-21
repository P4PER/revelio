import { describe, it, expect, afterEach } from 'vitest'
import { getWriteClient } from '../reindex'

const saved = { host: process.env.MEILI_HOST, key: process.env.MEILI_WRITE_KEY }
afterEach(() => {
  process.env.MEILI_HOST = saved.host
  process.env.MEILI_WRITE_KEY = saved.key
})

describe('getWriteClient', () => {
  it('throws when MEILI_WRITE_KEY is missing', () => {
    process.env.MEILI_HOST = 'http://localhost:7700'
    delete process.env.MEILI_WRITE_KEY
    expect(() => getWriteClient()).toThrow(/MEILI_WRITE_KEY/)
  })
  it('builds a client when host + write key are set', () => {
    process.env.MEILI_HOST = 'http://localhost:7700'
    process.env.MEILI_WRITE_KEY = 'scoped-write-key'
    expect(getWriteClient()).toBeTruthy()
  })
})
