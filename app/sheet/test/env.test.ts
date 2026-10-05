import { describe, it, expect } from 'vitest'
import { parseEnv } from '../src/env'

const base = {
  IMAGE_BASE_URL: 'http://rustfs:9000/images',
  SHEET_TOKEN: 'a-token-at-least-16-chars',
}

describe('parseEnv', () => {
  it('defaults the port', () => {
    expect(parseEnv(base).PORT).toBe(8080)
  })

  it('takes a port from the environment', () => {
    expect(parseEnv({ ...base, PORT: '9999' }).PORT).toBe(9999)
  })

  it('requires an image base and a token', () => {
    for (const key of ['IMAGE_BASE_URL', 'SHEET_TOKEN'] as const) {
      const { [key]: _dropped, ...rest } = base
      let thrown: unknown
      try { parseEnv(rest) } catch (err) { thrown = err }
      expect((thrown as Error | undefined)?.message).toContain(key)
    }
  })

  // The message is the first thing a container log shows.
  it('never quotes a value in its error', () => {
    let thrown: unknown
    try { parseEnv({ ...base, SHEET_TOKEN: 'short' }) } catch (err) { thrown = err }
    expect((thrown as Error).message).not.toContain('short')
  })

  // A query or fragment would survive into every art URL and make every card a
  // placeholder, with nothing failing at boot to say why.
  it('rejects an image base carrying a query or fragment', () => {
    expect(() => parseEnv({ ...base, IMAGE_BASE_URL: 'https://cdn.test/images?v=1' })).toThrow()
    expect(() => parseEnv({ ...base, IMAGE_BASE_URL: 'https://cdn.test/images#f' })).toThrow()
  })

  it('rejects an image base that is not a URL', () => {
    expect(() => parseEnv({ ...base, IMAGE_BASE_URL: 'rustfs:9000' })).toThrow()
  })
})
