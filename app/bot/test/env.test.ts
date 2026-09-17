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

describe('IMAGE_FETCH_BASE_URL', () => {
  const withPublic = { ...complete, IMAGE_BASE_URL: 'https://img.test/images' }

  it('falls back to IMAGE_BASE_URL when unset', () => {
    expect(parseEnv(withPublic).IMAGE_FETCH_BASE_URL).toBe('https://img.test/images')
  })

  it('takes its own value when set', () => {
    const env = parseEnv({ ...withPublic, IMAGE_FETCH_BASE_URL: 'http://rustfs.svc.cluster.local:9000/images' })
    expect(env.IMAGE_FETCH_BASE_URL).toBe('http://rustfs.svc.cluster.local:9000/images')
    expect(env.IMAGE_BASE_URL).toBe('https://img.test/images')
  })

  it('treats an empty value as unset, the way an env file writes it', () => {
    expect(parseEnv({ ...withPublic, IMAGE_FETCH_BASE_URL: '' }).IMAGE_FETCH_BASE_URL).toBe('https://img.test/images')
  })

  it('rejects a value that is not a URL', () => {
    // A bare host, as opposed to a bare host:port: new URL reads "rustfs:9000"
    // as the scheme "rustfs", so zod's url() takes it and the bad base shows up
    // as the render's missing-art warnings instead. Same as the four sibling
    // URL fields, which do not check the protocol either.
    let thrown: unknown
    try { parseEnv({ ...withPublic, IMAGE_FETCH_BASE_URL: 'rustfs' }) } catch (err) { thrown = err }
    expect((thrown as Error).message).toContain('IMAGE_FETCH_BASE_URL')
  })

  it('accepts a cluster-local service hostname', () => {
    // Pinned on purpose: zod 4's url() is stricter about hostnames, and the
    // production value is one of these. A bump should fail here, not at deploy.
    const url = 'http://svc-app-rustfs-f2b3494b.proj-reveliocards-9f0c37db.svc.cluster.local:9000/images'
    expect(parseEnv({ ...withPublic, IMAGE_FETCH_BASE_URL: url }).IMAGE_FETCH_BASE_URL).toBe(url)
  })
})
