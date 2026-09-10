import { describe, it, expect, vi, afterEach } from 'vitest'
import * as dbModule from '@revelio/db'
import { resolveLinkedUser } from '../src/data/link'

afterEach(() => vi.restoreAllMocks())

describe('resolveLinkedUser', () => {
  it('returns the Revelio user id for a linked snowflake', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue('user-1')
    expect(await resolveLinkedUser({} as never, '111')).toBe('user-1')
  })

  it('returns null for an unlinked snowflake', async () => {
    vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue(null)
    expect(await resolveLinkedUser({} as never, '999')).toBeNull()
  })
})
