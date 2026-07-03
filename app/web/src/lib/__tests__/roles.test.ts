import { describe, it, expect } from 'vitest'
import { hasRequiredRole } from '../roles'

describe('hasRequiredRole (fail-closed role gate)', () => {
  it('admin satisfies editor and admin', () => {
    expect(hasRequiredRole('admin', 'editor')).toBe(true)
    expect(hasRequiredRole('admin', 'admin')).toBe(true)
  })
  it('editor satisfies editor but not admin', () => {
    expect(hasRequiredRole('editor', 'editor')).toBe(true)
    expect(hasRequiredRole('editor', 'admin')).toBe(false)
  })
  it('user satisfies neither', () => {
    expect(hasRequiredRole('user', 'editor')).toBe(false)
    expect(hasRequiredRole('user', 'admin')).toBe(false)
  })
  it('unknown or absent roles fail closed', () => {
    expect(hasRequiredRole('wizard', 'editor')).toBe(false)
    expect(hasRequiredRole(null, 'editor')).toBe(false)
    expect(hasRequiredRole(undefined, 'admin')).toBe(false)
  })
})
