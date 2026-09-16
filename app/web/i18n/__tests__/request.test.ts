import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TIME_ZONE } from '../routing'

const rootLocale = vi.fn<() => Promise<string>>()
const notFound = vi.fn<() => never>(() => {
  throw new Error('NEXT_NOT_FOUND')
})

// Under jsdom, `next-intl/server` resolves to its client build, which throws on
// import. getRequestConfig is an identity wrapper over the callback (see its
// .d.ts), so standing in for it leaves the config logic itself under test.
vi.mock('next-intl/server', () => ({
  getRequestConfig: (createConfig: unknown) => createConfig,
}))
vi.mock('next/root-params', () => ({ locale: () => rootLocale() }))
vi.mock('next/navigation', () => ({ notFound: () => notFound() }))

// getRequestConfig hands the callback back, so the default export is the config
// factory itself: call it the way next-intl would.
async function loadConfig(params: { locale?: string }) {
  const { default: getConfig } = await import('../request')
  return getConfig({ ...params, requestLocale: Promise.resolve(undefined) })
}

// vitest's `rejects.toThrow` misfires in this workspace; catch by hand.
async function thrownBy(run: () => Promise<unknown>) {
  try {
    await run()
    return null
  } catch (e) {
    return (e as Error).message
  }
}

describe('i18n/request', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('takes the locale from the [locale] root param', async () => {
    rootLocale.mockResolvedValue('de')
    const config = await loadConfig({})
    expect(config.locale).toBe('de')
    expect(notFound).not.toHaveBeenCalled()
  })

  it('loads the messages for that locale', async () => {
    rootLocale.mockResolvedValue('de')
    const config = await loadConfig({})
    expect((config.messages as Record<string, unknown>).nav).toBeDefined()
    expect(config.messages).toEqual((await import('../../messages/de.json')).default)
  })

  // Without a zone next-intl formats in the host's own, so a server west of UTC
  // printed a stored calendar day (the terms effective date) as the day before.
  it('formats every date in the app time zone', async () => {
    rootLocale.mockResolvedValue('en')
    const config = await loadConfig({})
    expect(config.timeZone).toBe(TIME_ZONE)
  })

  it('prefers an explicit locale override without reading root params', async () => {
    const config = await loadConfig({ locale: 'en' })
    expect(config.locale).toBe('en')
    expect(rootLocale).not.toHaveBeenCalled()
  })

  it('404s on a segment that is not a configured locale', async () => {
    // `/unknown.txt` never reaches the proxy - its matcher skips dotted paths -
    // so the segment arrives verbatim and must not select a messages file.
    rootLocale.mockResolvedValue('unknown.txt')
    expect(await thrownBy(() => loadConfig({}))).toBe('NEXT_NOT_FOUND')
    expect(notFound).toHaveBeenCalled()
  })

  it('404s when the segment is missing entirely', async () => {
    rootLocale.mockResolvedValue(undefined as unknown as string)
    expect(await thrownBy(() => loadConfig({}))).toBe('NEXT_NOT_FOUND')
  })
})
