import { describe, it, expect, vi, beforeEach } from 'vitest'

const getSiteSettings = vi.fn()
vi.mock('@revelio/db', () => ({ getSiteSettings: (...a: unknown[]) => getSiteSettings(...a) }))
vi.mock('@/lib/db', () => ({ getDb: () => ({ __db: true }) }))

import { loadSiteSettings, SITE_SETTINGS_TAG } from '../site-settings'

beforeEach(() => getSiteSettings.mockReset())

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
