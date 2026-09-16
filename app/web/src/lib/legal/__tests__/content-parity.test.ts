import { describe, it, expect } from 'vitest'
import { LEGAL_DOCUMENTS } from '@/lib/legal/documents'

const names = Object.keys(LEGAL_DOCUMENTS) as (keyof typeof LEGAL_DOCUMENTS)[]

// The registry's `satisfies` clause proves a German file exists. It cannot
// prove the German file still has the same sections: a heading dropped in
// translation leaves a legal page that looks complete and is not.
describe('legal documents have the same shape in both locales', () => {
  it.each(names)('%s has the same heading shape in en and de', async (name) => {
    const [en, de] = await Promise.all([LEGAL_DOCUMENTS[name].en(), LEGAL_DOCUMENTS[name].de()])
    expect(en.toc.length).toBeGreaterThan(0)
    expect(de.toc.map((entry) => entry.depth)).toEqual(en.toc.map((entry) => entry.depth))
  })
})
