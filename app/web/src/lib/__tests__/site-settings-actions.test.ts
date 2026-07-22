import { describe, it, expect, vi, beforeEach } from 'vitest'

const requireRole = vi.fn()
const upsertSiteSettings = vi.fn()
const updateTag = vi.fn()
vi.mock('@/lib/session', () => ({ requireRole: (...a: unknown[]) => requireRole(...a) }))
vi.mock('@/lib/db', () => ({ getDb: () => ({ __db: true }) }))
vi.mock('@revelio/db', () => ({ upsertSiteSettings: (...a: unknown[]) => upsertSiteSettings(...a) }))
vi.mock('@/lib/site-settings', () => ({ SITE_SETTINGS_TAG: 'site-settings' }))
vi.mock('next/cache', () => ({ updateTag: (...a: unknown[]) => updateTag(...a) }))

import { updateSiteSettings } from '../site-settings-actions'

const VALID = {
  operatorName: 'Jane Doe',
  operatorAddress: 'Main St 1\n12345 Town',
  contactEmail: 'hi@revelio.cards',
  hostingProvider: 'Acme VPS',
  responsiblePerson: '',
  githubUrl: 'https://github.com/P4PER/revelio',
}

beforeEach(() => {
  requireRole.mockReset().mockResolvedValue(undefined)
  upsertSiteSettings.mockReset().mockResolvedValue(undefined)
  updateTag.mockReset()
})

describe('updateSiteSettings', () => {
  it('rejects a non-admin (requireRole throws)', async () => {
    requireRole.mockRejectedValue(new Error('Forbidden'))
    let caught: unknown
    await updateSiteSettings(VALID).catch((e) => { caught = e })
    expect((caught as Error)?.message).toBe('Forbidden')
    expect(upsertSiteSettings).not.toHaveBeenCalled()
  })

  it('rejects an invalid email', async () => {
    const result = await updateSiteSettings({ ...VALID, contactEmail: 'not-an-email' })
    expect(result).toEqual({ ok: false, error: 'invalid' })
    expect(upsertSiteSettings).not.toHaveBeenCalled()
  })

  it('rejects an invalid github url', async () => {
    const result = await updateSiteSettings({ ...VALID, githubUrl: 'not a url' })
    expect(result).toEqual({ ok: false, error: 'invalid' })
  })

  it('rejects a non-http(s) github url scheme', async () => {
    const result = await updateSiteSettings({ ...VALID, githubUrl: 'javascript:alert(1)' })
    expect(result).toEqual({ ok: false, error: 'invalid' })
    expect(upsertSiteSettings).not.toHaveBeenCalled()
  })

  it('upserts (blank → null), busts the cache tag, and returns ok', async () => {
    const result = await updateSiteSettings(VALID)
    expect(result).toEqual({ ok: true })
    expect(upsertSiteSettings).toHaveBeenCalledWith(
      { __db: true },
      {
        operatorName: 'Jane Doe',
        operatorAddress: 'Main St 1\n12345 Town',
        contactEmail: 'hi@revelio.cards',
        hostingProvider: 'Acme VPS',
        responsiblePerson: null,
        githubUrl: 'https://github.com/P4PER/revelio',
      },
    )
    expect(updateTag).toHaveBeenCalledWith('site-settings')
  })

  it('allows empty contactEmail and githubUrl', async () => {
    const result = await updateSiteSettings({ ...VALID, contactEmail: '', githubUrl: '' })
    expect(result).toEqual({ ok: true })
  })
})
