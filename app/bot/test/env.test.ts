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
    // .env.example ships `DISCORD_GUILD_ID=` and compose forwards ${DISCORD_GUILD_ID},
    // so the documented "unset = register globally" setup arrives as an empty string.
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
