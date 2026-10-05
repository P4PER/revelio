import { describe, it, expect } from 'vitest'
import { parseEnv } from '../src/env'

const complete = {
  DISCORD_TOKEN: 'token',
  DISCORD_CLIENT_ID: '123',
  DATABASE_URL: 'postgres://revelio:revelio@localhost:5432/revelio',
  MEILI_HOST: 'http://localhost:7700',
  MEILI_SEARCH_KEY: 'key',
  IMAGE_BASE_URL: 'http://localhost:9000/images',
  SITE_BASE_URL: 'https://revelio.cards',
  SHEET_SERVICE_URL: 'http://sheet:8080',
  SHEET_TOKEN: 'a-token-at-least-16-chars',
}

describe('parseEnv', () => {
  it('accepts a complete environment', () => {
    const env = parseEnv(complete)
    expect(env.DISCORD_TOKEN).toBe('token')
    expect(env.SITE_BASE_URL).toBe('https://revelio.cards')
  })

  it('treats DISCORD_GUILD_ID as optional', () => {
    expect(parseEnv(complete).DISCORD_GUILD_ID).toBeUndefined()
    expect(parseEnv({ ...complete, DISCORD_GUILD_ID: '999' }).DISCORD_GUILD_ID).toBe('999')
  })

  it('treats an empty DISCORD_GUILD_ID as unset', () => {
    // .env.example ships `DISCORD_GUILD_ID=` blank, so the documented
    // "unset = register globally" setup arrives as an empty string.
    expect(parseEnv({ ...complete, DISCORD_GUILD_ID: '' }).DISCORD_GUILD_ID).toBeUndefined()
  })

  it('defaults MEILI_SEARCH_KEY to an empty string', () => {
    const { MEILI_SEARCH_KEY, ...withoutKey } = complete
    expect(parseEnv(withoutKey).MEILI_SEARCH_KEY).toBe('')
  })

  it('names every missing variable in one message', () => {
    let message = ''
    try {
      parseEnv({ MEILI_SEARCH_KEY: 'key' })
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain('DISCORD_TOKEN')
    expect(message).toContain('DATABASE_URL')
    expect(message).toContain('SITE_BASE_URL')
  })

  it('never puts a secret value in the error message', () => {
    let message = ''
    try {
      parseEnv({ DISCORD_TOKEN: 'super-secret-token' })
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).not.toContain('super-secret-token')
  })
})

describe('the render service', () => {
  it('requires a URL and a token', () => {
    for (const key of ['SHEET_SERVICE_URL', 'SHEET_TOKEN'] as const) {
      const { [key]: _dropped, ...rest } = complete
      let thrown: unknown
      try { parseEnv(rest) } catch (err) { thrown = err }
      expect((thrown as Error | undefined)?.message).toContain(key)
    }
  })

  it('rejects a service URL that is not a URL', () => {
    let thrown: unknown
    try { parseEnv({ ...complete, SHEET_SERVICE_URL: 'sheet:8080' }) } catch (err) { thrown = err }
    expect((thrown as Error).message).toContain('SHEET_SERVICE_URL')
  })

  // The bot appends /render to this, so a query or fragment lands in the middle
  // of the URL: http://sheet:8080/?t=x/render resolves nowhere and every /deck
  // falls back to the list, with nothing failing at boot to say why. The service
  // refuses one on its own base for the same reason.
  it('rejects a service URL carrying a query or fragment', () => {
    for (const value of ['http://sheet:8080/?token=x', 'http://sheet:8080/#frag']) {
      let thrown: unknown
      try { parseEnv({ ...complete, SHEET_SERVICE_URL: value }) } catch (err) { thrown = err }
      expect((thrown as Error | undefined)?.message).toContain('SHEET_SERVICE_URL')
    }
  })

  // zod marks a failed .url() dirty rather than aborted, so the refinement runs
  // anyway - on a value new URL() cannot parse. The TypeError that throws out of
  // safeParse walks past the handler below, and the operator who left the
  // variable blank gets `TypeError: Invalid URL` with no variable named and none
  // of their other env problems reported.
  it('still reports a value new URL() cannot parse as an env problem', () => {
    for (const value of ['', 'nonsense', '8080', 'http://']) {
      let thrown: unknown
      try { parseEnv({ ...complete, SHEET_SERVICE_URL: value }) } catch (err) { thrown = err }
      expect((thrown as Error | undefined)?.message).toContain('Invalid bot environment')
      expect((thrown as Error | undefined)?.message).toContain('SHEET_SERVICE_URL')
    }
  })
})
