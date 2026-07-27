import { describe, it, expect } from 'vitest'
import robots from '../robots'

describe('robots', () => {
  const rules = robots()
  const rule = Array.isArray(rules.rules) ? rules.rules[0] : rules.rules
  const disallow = [rule?.disallow].flat().filter(Boolean) as string[]

  it('does not enumerate sensitive paths (kept out via noindex, not robots.txt)', () => {
    for (const secret of ['admin', 'login', 'register', 'collection', 'edit', 'mine']) {
      expect(disallow.some((d) => d.includes(secret))).toBe(false)
    }
  })

  it('disallows only the non-indexable api surface and links the sitemap', () => {
    expect(disallow).toContain('/api/')
    expect(rules.sitemap).toMatch(/\/sitemap\.xml$/)
  })
})
