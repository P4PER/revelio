// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTranslator } from 'next-intl'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

const MESSAGES = { en, de } as const

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: 'en' | 'de'; namespace: string }) =>
    createTranslator({ locale, messages: MESSAGES[locale], namespace }),
}))

// Fails the first `jpgFailures` reads of the card art, passes everything else through.
let jpgFailures = 0
const readFileMock = vi.hoisted(() => vi.fn())
vi.mock('node:fs/promises', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  readFileMock.mockImplementation((path: unknown, ...rest: unknown[]) =>
    String(path).endsWith('.jpg') && jpgFailures-- > 0
      ? Promise.reject(new Error('EIO'))
      : (actual.readFile as (...args: unknown[]) => Promise<Buffer>)(path, ...rest),
  )
  return { ...actual, readFile: readFileMock }
})

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]

const artReads = () => readFileMock.mock.calls.filter(([path]) => String(path).endsWith('.jpg')).length

describe('renderDiscordOgImage', () => {
  beforeEach(() => {
    vi.resetModules()
    readFileMock.mockClear()
    jpgFailures = 0
  })

  it.each(['en', 'de'])('renders a 1200x630 PNG in %s', async (locale) => {
    const { renderDiscordOgImage } = await import('../og-image')
    const res = await renderDiscordOgImage(locale)
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 4)]).toEqual(PNG_SIGNATURE)
    // IHDR: width and height are the big-endian words at offsets 16 and 20.
    const view = new DataView(bytes.buffer)
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630])
  })

  it('retries the card art after a failed read instead of caching the failure', async () => {
    const { renderDiscordOgImage } = await import('../og-image')
    jpgFailures = 1
    await renderDiscordOgImage('en')
    await renderDiscordOgImage('en')
    await renderDiscordOgImage('en')
    // One failed read, one successful retry, then the cached success.
    expect(artReads()).toBe(2)
  })
})
