import { describe, it, expect } from 'vitest'
import { DOCS_NAV } from '@/lib/docs/nav'
import { buildSitemap, localizedEntries, STATIC_ROUTES } from '../sitemap'

const BASE = 'https://revelio.cards'

describe('localizedEntries', () => {
  it('emits one entry per locale with a full hreflang map including x-default', () => {
    const entries = localizedEntries('/card/abc')
    expect(entries.map((e) => e.url)).toEqual([`${BASE}/card/abc`, `${BASE}/de/card/abc`])
    for (const e of entries) {
      expect(e.alternates?.languages).toEqual({
        en: `${BASE}/card/abc`,
        de: `${BASE}/de/card/abc`,
        'x-default': `${BASE}/card/abc`,
      })
    }
  })

  it('emits lastModified only when given, and no priority/changeFrequency', () => {
    const when = new Date('2026-01-02T00:00:00Z')
    const [withDate] = localizedEntries('/card/x', when)
    expect(withDate.lastModified).toBe(when)
    expect(withDate.priority).toBeUndefined()
    expect(withDate.changeFrequency).toBeUndefined()

    const [withoutDate] = localizedEntries('/about')
    expect(withoutDate.lastModified).toBeUndefined()
  })
})

describe('buildSitemap', () => {
  const when = new Date('2026-01-01T00:00:00Z')
  const map = buildSitemap({
    cards: [{ id: 'bs-1', updatedAt: when }],
    sets: [{ id: 'BS', updatedAt: when }],
  })
  const urls = map.map((e) => e.url)

  it('includes every static route in both locales', () => {
    for (const href of STATIC_ROUTES) {
      const deSuffix = href === '/' ? '' : href
      expect(urls).toContain(`${BASE}${href}`)
      expect(urls).toContain(`${BASE}/de${deSuffix}`)
    }
  })

  it('includes card and set pages in both locales', () => {
    expect(urls).toContain(`${BASE}/card/bs-1`)
    expect(urls).toContain(`${BASE}/de/card/bs-1`)
    expect(urls).toContain(`${BASE}/sets/BS`)
    expect(urls).toContain(`${BASE}/de/sets/BS`)
  })

  it('carries lastModified for dynamic entries', () => {
    const card = map.find((e) => e.url === `${BASE}/card/bs-1`)
    expect(card?.lastModified).toBe(when)
  })

  it('never lists admin, auth, or editor routes', () => {
    expect(urls.some((u) => /\/(admin|login|register|edit|collection)(\/|$)/.test(u))).toBe(false)
  })
})

describe('the sitemap covers the docs', () => {
  it('lists the hub and every docs page as a static route', () => {
    expect(STATIC_ROUTES).toContain('/docs')
    for (const slug of DOCS_NAV.flatMap((section) => section.pages)) {
      expect(STATIC_ROUTES).toContain(`/docs/${slug}`)
    }
  })

  // Each page needs its full hreflang alternates, or Google treats the German
  // page as a duplicate of the English one.
  it('emits both locales with alternates for a docs page', () => {
    const entries = buildSitemap({ cards: [], sets: [] })
    const docs = entries.filter((entry) => entry.url.includes('/docs/discord/commands'))
    expect(docs).toHaveLength(2)
    expect(Object.keys(docs[0].alternates!.languages!)).toContain('x-default')
  })
})
