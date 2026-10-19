// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTranslator } from 'next-intl'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type OgModule = typeof import('../og-image')

const MESSAGES = { en, de } as const

vi.mock('next-intl/server', () => ({
  getTranslations: async ({ locale, namespace }: { locale: 'en' | 'de'; namespace: string }) =>
    createTranslator({ locale, messages: MESSAGES[locale], namespace }),
}))

// Fails the next N reads of any file whose path ends with a given suffix and passes
// everything else through.
const failures = new Map<string, number>()
const readFileMock = vi.hoisted(() => vi.fn())
vi.mock('node:fs/promises', async (importOriginal) => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  readFileMock.mockImplementation((path: unknown, ...rest: unknown[]) => {
    const suffix = [...failures.keys()].find((s) => String(path).endsWith(s))
    const left = suffix ? (failures.get(suffix) ?? 0) : 0
    if (suffix && left > 0) {
      failures.set(suffix, left - 1)
      return Promise.reject(new Error('EIO'))
    }
    return (actual.readFile as (...args: unknown[]) => Promise<Buffer>)(path, ...rest)
  })
  return { ...actual, readFile: readFileMock }
})

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47]
const LOGO = 'revelio-logo-on-dark.svg'
const DARK_ICON = 'revelio-icon-on-dark.svg'
const ART = '.jpg'

// A 1x1 transparent PNG.
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

// The three share images, each rendered the way its route does.
const RENDERS: [name: string, render: (og: OgModule) => Promise<Response>][] = [
  ['default', (og) => og.renderDefaultOgImage('en')],
  [
    'deck',
    async (og) => {
      // Any decodable image stands in for the starting character's art.
      const art = `data:image/png;base64,${PNG_1X1}`
      return og.renderDeckOgImage({ name: 'Charms', formatLabel: 'Classic', lessonCodes: [], artDataUri: art })
    },
  ],
  ['discord', (og) => og.renderDiscordOgImage('en')],
]

const reads = (suffix: string) =>
  readFileMock.mock.calls.filter(([path]) => String(path).endsWith(suffix)).length

async function expectOgPng(res: Response) {
  const bytes = new Uint8Array(await res.arrayBuffer())
  expect([...bytes.slice(0, 4)]).toEqual(PNG_SIGNATURE)
  // IHDR: width and height are the big-endian words at offsets 16 and 20.
  const view = new DataView(bytes.buffer)
  expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630])
}

beforeEach(() => {
  vi.resetModules()
  readFileMock.mockClear()
  failures.clear()
})

describe('share image logo', () => {
  it.each(RENDERS)('draws the dark logo file on the %s image', async (_, render) => {
    const og = await import('../og-image')
    await expectOgPng(await render(og))
    expect(reads(LOGO)).toBe(1)
  })

  it.each(RENDERS)('renders the %s image without the logo when it cannot be read, then retries', async (_, render) => {
    const og = await import('../og-image')
    failures.set(LOGO, 1)
    await expectOgPng(await render(og))
    await expectOgPng(await render(og))
    // One failed read, then a fresh one: the failure was not cached.
    expect(reads(LOGO)).toBe(2)
  })
})

describe('renderDiscordOgImage', () => {
  it.each(['en', 'de'])('renders a 1200x630 PNG in %s', async (locale) => {
    const { renderDiscordOgImage } = await import('../og-image')
    await expectOgPng(await renderDiscordOgImage(locale))
  })

  it('draws the bot avatar with the dark-background icon', async () => {
    const { renderDiscordOgImage } = await import('../og-image')
    await renderDiscordOgImage('en')
    expect(reads(DARK_ICON)).toBe(1)
  })

  it('retries the card art after a failed read instead of caching the failure', async () => {
    const { renderDiscordOgImage } = await import('../og-image')
    failures.set(ART, 1)
    await renderDiscordOgImage('en')
    await renderDiscordOgImage('en')
    await renderDiscordOgImage('en')
    // One failed read, one successful retry, then the cached success.
    expect(reads(ART)).toBe(2)
  })
})
