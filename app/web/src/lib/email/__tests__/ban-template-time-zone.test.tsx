import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderBanEmail } from '../ban-template'

// A ban ends on a calendar day stored at UTC midnight. With the app zone behind
// UTC the notice must still name that day, not the evening before.
vi.mock('@/../i18n/time-zone', () => ({ TIME_ZONE: 'America/Los_Angeles' }))

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://revelio.test')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('renderBanEmail time zone', () => {
  it('names the stored end day whatever the app zone', async () => {
    const { text } = await renderBanEmail({
      reason: 'Spam',
      expiresAt: new Date('2030-01-01T00:00:00Z'),
      contactEmail: '',
    })
    expect(text).toContain('January 1, 2030')
  })
})
