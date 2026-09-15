import { describe, it, expect } from 'vitest'
import { DOCS_NAV } from '@/lib/docs/nav'
import { loadDoc } from '@/lib/docs/registry'

const slugs = DOCS_NAV.flatMap((section) => section.pages)

// The registry's `satisfies` clause proves a German file exists. It cannot
// prove the German file still says the same things: a section quietly dropped
// in translation leaves a page that looks complete and is not.
describe('content structure is the same in both locales', () => {
  it.each(slugs)('%s has the same heading shape in en and de', async (slug) => {
    const [en, de] = await Promise.all([loadDoc(slug, 'en'), loadDoc(slug, 'de')])
    expect(de.toc.map((entry) => entry.depth)).toEqual(en.toc.map((entry) => entry.depth))
  })

  it.each(slugs)('%s has at least one section in both locales', async (slug) => {
    const [en, de] = await Promise.all([loadDoc(slug, 'en'), loadDoc(slug, 'de')])
    expect(en.toc.length).toBeGreaterThan(0)
    expect(de.toc.length).toBeGreaterThan(0)
  })
})
