import { describe, it, expect, vi, afterEach } from 'vitest'
import * as dbModule from '@revelio/db'
import { resolveLinkedUser } from '../src/data/link'

afterEach(() => vi.restoreAllMocks())

// The ban rule lives in the query (ingest/test/discord-link.test.ts); this only
// pins that the one place every personal command asks goes through it.
describe('resolveLinkedUser', () => {
  it('resolves the snowflake through the ban-aware account query', async () => {
    const lookup = vi.spyOn(dbModule, 'getUserIdByDiscordAccount').mockResolvedValue('user-1')
    const db = {} as never
    expect(await resolveLinkedUser(db, '111')).toBe('user-1')
    expect(lookup).toHaveBeenCalledWith(db, '111')
  })
})
