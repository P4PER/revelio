import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const getCardViews = vi.fn()
const getDb = vi.fn(() => ({ __db: true }))
vi.mock('@revelio/db', () => ({ getCardViews: (...a: unknown[]) => getCardViews(...a) }))
vi.mock('@/lib/server/db', () => ({ getDb: () => getDb() }))
// unstable_cache needs Next's incremental cache; a pass-through is enough here.
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))

import { AUTH_FAN_CARD_IDS, getAuthFanImages } from '../auth-fan'

const BASE = 'https://img.test/'
const LEVIOSA = 'https://img.test/cards/thumb/bs-111-wingardium-leviosa.3.webp'
const LUMOS = 'https://img.test/cards/thumb/poa-71-lumos.7.webp'

// Braces matter: a function returned from beforeEach runs as teardown.
beforeEach(() => {
  getCardViews.mockReset()
  getDb.mockReset()
  getDb.mockImplementation(() => ({ __db: true }))
  vi.stubEnv('NEXT_PUBLIC_IMAGE_BASE_URL', BASE)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getAuthFanImages', () => {
  it('asks for the two fan cards', async () => {
    getCardViews.mockResolvedValue({})
    await getAuthFanImages()
    expect(getCardViews).toHaveBeenCalledWith({ __db: true }, [...AUTH_FAN_CARD_IDS])
    expect(AUTH_FAN_CARD_IDS).toEqual(['bs-111-wingardium-leviosa', 'poa-71-lumos'])
  })

  it('returns thumbnail urls in slot order, whatever order the record comes back in', async () => {
    getCardViews.mockResolvedValue({
      'poa-71-lumos': { imageVersion: 7 },
      'bs-111-wingardium-leviosa': { imageVersion: 3 },
    })
    expect(await getAuthFanImages()).toEqual([LEVIOSA, LUMOS])
  })

  it('skips a card with no image and a card that is missing', async () => {
    getCardViews.mockResolvedValue({ 'bs-111-wingardium-leviosa': { imageVersion: null } })
    expect(await getAuthFanImages()).toEqual([])

    getCardViews.mockResolvedValue({ 'poa-71-lumos': { imageVersion: 7 } })
    expect(await getAuthFanImages()).toEqual([LUMOS])
  })

  it('returns nothing when the database read fails', async () => {
    getCardViews.mockRejectedValue(new Error('connection refused'))
    expect(await getAuthFanImages()).toEqual([])
  })

  it('returns nothing when there is no database configured', async () => {
    getDb.mockImplementation(() => {
      throw new Error('DATABASE_URL is required')
    })
    expect(await getAuthFanImages()).toEqual([])
  })

  it('returns nothing without an image base, rather than relative urls', async () => {
    vi.stubEnv('NEXT_PUBLIC_IMAGE_BASE_URL', '')
    getCardViews.mockResolvedValue({ 'poa-71-lumos': { imageVersion: 7 } })
    expect(await getAuthFanImages()).toEqual([])
  })
})
