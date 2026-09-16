import { describe, it, expect } from 'vitest'
import { routing } from '@/../i18n/routing'
import { DOCS_NAV, docId, docNeighbours, isDocSlug, type DocSection } from '@/lib/docs/nav'
import { DOC_PAGES, loadDoc } from '@/lib/docs/registry'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

const slugs = DOCS_NAV.flatMap((section) => section.pages)

describe('the docs page map', () => {
  it('lists at least one live section with pages', () => {
    expect(DOCS_NAV.some((s) => s.status === 'live' && s.pages.length > 0)).toBe(true)
  })

  it('never gives a planned section pages it cannot serve', () => {
    for (const section of DOCS_NAV) {
      if (section.status === 'planned') expect(section.pages).toEqual([])
    }
  })

  it('registers every navigable page', () => {
    for (const slug of slugs) expect(DOC_PAGES).toHaveProperty(slug)
  })

  it('navigates to every registered page', () => {
    expect(Object.keys(DOC_PAGES).sort()).toEqual([...slugs].sort())
  })

  it('accepts a known slug and rejects an unknown one', () => {
    expect(isDocSlug('discord/commands')).toBe(true)
    expect(isDocSlug('discord/nonsense')).toBe(false)
  })

  it('flattens a nested slug to a single id', () => {
    expect(docId('discord/commands')).toBe('discord-commands')
    expect(docId('discord')).toBe('discord')
  })
})

describe('a page\'s neighbours', () => {
  it('gives the first page no previous', () => {
    expect(docNeighbours('discord')).toEqual({ prev: null, next: 'discord/commands' })
  })

  it('gives the last page no next', () => {
    expect(docNeighbours('discord/troubleshooting')).toEqual({
      prev: 'discord/privacy',
      next: null,
    })
  })

  it('gives a middle page both', () => {
    expect(docNeighbours('discord/commands')).toEqual({ prev: 'discord', next: 'discord/linking' })
  })

  // Only one section is live today, so fake a second: when the API section
  // ships, the last Discord page has to lead into it without a second list.
  it('crosses a section boundary', () => {
    const nav = [
      { key: 'discord', status: 'live', pages: ['discord', 'discord/commands'] },
      { key: 'api', status: 'live', pages: ['discord/linking'] },
    ] as const satisfies readonly DocSection[]
    expect(docNeighbours('discord/commands', nav)).toEqual({
      prev: 'discord',
      next: 'discord/linking',
    })
    expect(docNeighbours('discord/linking', nav)).toEqual({
      prev: 'discord/commands',
      next: null,
    })
  })
})

describe('docs content', () => {
  // The satisfies clause makes a missing locale a type error, but typecheck
  // does not prove the file behind the loader actually resolves.
  it.each(slugs.flatMap((slug) => routing.locales.map((locale) => [slug, locale] as const)))(
    'loads %s in %s',
    async (slug, locale) => {
      const mod = await loadDoc(slug, locale)
      expect(typeof mod.default).toBe('function')
      expect(Array.isArray(mod.toc)).toBe(true)
    },
  )
})

// src/lib/__tests__/message-key-parity.test.ts already proves every leaf key
// exists in both catalogs. What it cannot know is that those keys line up with
// DOCS_NAV, which is what these assert.
describe('docs i18n', () => {
  it('has a docs namespace in both locales', () => {
    expect(en.docs).toBeTruthy()
    expect(de.docs).toBeTruthy()
  })

  it('titles and describes every page in both locales', () => {
    for (const messages of [en.docs, de.docs] as const) {
      for (const slug of slugs) {
        const page = (messages.pages as Record<string, { title: string; description: string }>)[
          docId(slug)
        ]
        expect(page?.title, `title for ${slug}`).toBeTruthy()
        expect(page?.description, `description for ${slug}`).toBeTruthy()
      }
    }
  })

  it('names every section in both locales', () => {
    for (const messages of [en.docs, de.docs] as const) {
      for (const section of DOCS_NAV) {
        const entry = (messages.sections as Record<string, { title: string; summary: string }>)[
          section.key
        ]
        expect(entry?.title, `title for ${section.key}`).toBeTruthy()
        expect(entry?.summary, `summary for ${section.key}`).toBeTruthy()
      }
    }
  })
})
