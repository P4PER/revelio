import { describe, it, expect } from 'vitest'
import { REDIRECT_PARAM, safeRedirectPath, loginHref, registerHref } from '../redirect-path'

describe('safeRedirectPath', () => {
  it('keeps a root-relative path, including query and hash', () => {
    expect(safeRedirectPath('/collection')).toBe('/collection')
    expect(safeRedirectPath('/collection?tab=browse#top')).toBe('/collection?tab=browse#top')
  })

  it('rejects absolute URLs', () => {
    expect(safeRedirectPath('https://evil.example/collection')).toBeNull()
    expect(safeRedirectPath('javascript:alert(1)')).toBeNull()
  })

  it('rejects protocol-relative paths', () => {
    expect(safeRedirectPath('//evil.example')).toBeNull()
  })

  it('rejects backslash variants browsers normalise to //', () => {
    expect(safeRedirectPath('/\\evil.example')).toBeNull()
    expect(safeRedirectPath('\\\\evil.example')).toBeNull()
  })

  it('rejects control characters', () => {
    expect(safeRedirectPath('/collection\nSet-Cookie: x=1')).toBeNull()
  })

  it('rejects a repeated query parameter, which Next hands back as an array', () => {
    expect(safeRedirectPath(['/collection', '/decks/mine'])).toBeNull()
  })

  it('drops a locale prefix, which the navigation helpers would add a second time', () => {
    expect(safeRedirectPath('/de/collection')).toBe('/collection')
    expect(safeRedirectPath('/en/decks/mine')).toBe('/decks/mine')
    expect(safeRedirectPath('/de')).toBe('/')
    expect(safeRedirectPath('/de?tab=browse')).toBe('/?tab=browse')
    expect(safeRedirectPath('/de#top')).toBe('/#top')
    expect(safeRedirectPath('/de/en/collection')).toBe('/collection')
  })

  it('keeps a first segment that only starts with a locale', () => {
    expect(safeRedirectPath('/deck/42')).toBe('/deck/42')
    expect(safeRedirectPath('/english')).toBe('/english')
  })

  it('validates what is left after the locale prefix', () => {
    expect(safeRedirectPath('/de//evil.example')).toBeNull()
    expect(safeRedirectPath('/de/\\evil.example')).toBeNull()
  })

  it('rejects empty and missing values', () => {
    expect(safeRedirectPath('')).toBeNull()
    expect(safeRedirectPath(null)).toBeNull()
    expect(safeRedirectPath(undefined)).toBeNull()
  })
})

describe('loginHref', () => {
  it('is bare /login without a target', () => {
    expect(loginHref()).toBe('/login')
  })

  it('carries an encoded target', () => {
    expect(loginHref('/collection?tab=browse')).toBe(`/login?${REDIRECT_PARAM}=%2Fcollection%3Ftab%3Dbrowse`)
  })

  it('carries a locale-prefixed target without its prefix', () => {
    expect(loginHref('/de/collection')).toBe(`/login?${REDIRECT_PARAM}=%2Fcollection`)
  })

  it('drops an unsafe target rather than passing it on', () => {
    expect(loginHref('//evil.example')).toBe('/login')
  })
})

describe('registerHref', () => {
  it('carries the same target to /register', () => {
    expect(registerHref('/decks/mine')).toBe(`/register?${REDIRECT_PARAM}=%2Fdecks%2Fmine`)
  })
})
