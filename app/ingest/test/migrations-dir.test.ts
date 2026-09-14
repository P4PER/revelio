import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolveMigrationsDir } from '@revelio/db'

describe('resolveMigrationsDir', () => {
  it('defaults to the drizzle folder next to the db package source', () => {
    const dir = resolveMigrationsDir({})
    expect(dir.endsWith('/db/drizzle')).toBe(true)
    expect(existsSync(dir)).toBe(true)
  })

  it('honours MIGRATIONS_DIR so a bundle can state its own location', () => {
    expect(resolveMigrationsDir({ MIGRATIONS_DIR: '/app/drizzle' })).toBe('/app/drizzle')
  })

  it('ignores an empty MIGRATIONS_DIR, which is how an unset key arrives from an env file', () => {
    const dir = resolveMigrationsDir({ MIGRATIONS_DIR: '' })
    expect(dir.endsWith('/db/drizzle')).toBe(true)
  })
})
