import { describe, it, expect, vi, beforeEach } from 'vitest'

const getSiteSettings = vi.fn()
vi.mock('@revelio/db', () => ({ getSiteSettings: (...a: unknown[]) => getSiteSettings(...a) }))
vi.mock('@/lib/server/db', () => ({ getDb: () => ({ __db: true }) }))
// unstable_cache needs Next's incremental cache; a pass-through is enough here.
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))

import { getFooterContactEmail, loadSiteSettings, SITE_SETTINGS_TAG } from '../site-settings'

// Braces matter: mockReset() returns the mock, and a function returned from
// beforeEach runs as teardown, which would call a throwing mock after the test.
beforeEach(() => {
  getSiteSettings.mockReset()
})

describe('loadSiteSettings', () => {
  it('reads settings from the db client', async () => {
    getSiteSettings.mockResolvedValue({ id: 'singleton', operatorName: 'Jane' })
    const result = await loadSiteSettings()
    expect(getSiteSettings).toHaveBeenCalledWith({ __db: true })
    expect(result).toEqual({ id: 'singleton', operatorName: 'Jane' })
  })

  it('exposes the cache tag', () => {
    expect(SITE_SETTINGS_TAG).toBe('site-settings')
  })
})

describe('getFooterContactEmail', () => {
  it('returns the configured contact address', async () => {
    getSiteSettings.mockResolvedValue({ contactEmail: 'help@revelio.test' })
    expect(await getFooterContactEmail()).toBe('help@revelio.test')
  })

  it('returns an empty string when no settings row exists', async () => {
    getSiteSettings.mockResolvedValue(null)
    expect(await getFooterContactEmail()).toBe('')
  })

  // The footer line is optional; a failed read must not stop the email it sits in.
  it('returns an empty string when the settings cannot be read', async () => {
    getSiteSettings.mockRejectedValue(new Error('db down'))
    expect(await getFooterContactEmail()).toBe('')
  })
})
