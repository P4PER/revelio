import { describe, it, expect } from 'vitest'
import { resolveAdminSection, activeSectionHref, visibleSections } from '../admin-nav'

describe('visibleSections', () => {
  it('hides admin-only sections for non-admins', () => {
    expect(visibleSections(false).map((s) => s.id)).toEqual(['sub-types', 'sets'])
  })
  it('shows all sections for admins', () => {
    expect(visibleSections(true).map((s) => s.id)).toEqual([
      'sub-types',
      'sets',
      'users',
      'settings',
    ])
  })
})

describe('resolveAdminSection', () => {
  it('returns a valid stored section', () => {
    expect(resolveAdminSection('/admin/sets', false)).toBe('/admin/sets')
  })
  it('defaults to sub-types when the cookie is absent', () => {
    expect(resolveAdminSection(undefined, false)).toBe('/admin/sub-types')
  })
  it('defaults when the value is unknown/garbage', () => {
    expect(resolveAdminSection('/admin/../etc', true)).toBe('/admin/sub-types')
  })
  it('rejects an admin-only target for a non-admin', () => {
    expect(resolveAdminSection('/admin/users', false)).toBe('/admin/sub-types')
  })
  it('allows an admin-only target for an admin', () => {
    expect(resolveAdminSection('/admin/users', true)).toBe('/admin/users')
  })
})

describe('activeSectionHref', () => {
  it('matches the exact section path', () => {
    expect(activeSectionHref('/admin/sets')).toBe('/admin/sets')
  })
  it('matches a nested sub-page to its parent section', () => {
    expect(activeSectionHref('/admin/sets/new')).toBe('/admin/sets')
    expect(activeSectionHref('/admin/sets/base-set/edit')).toBe('/admin/sets')
  })
  it('returns undefined for /admin itself', () => {
    expect(activeSectionHref('/admin')).toBeUndefined()
  })
})
