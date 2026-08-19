import { describe, it, expect } from 'vitest'
import { THEME_COOKIE, parseTheme } from '@/lib/theme'

describe('theme cookie', () => {
  it('uses the revelio. cookie prefix', () => {
    expect(THEME_COOKIE).toBe('revelio.theme')
  })

  it('parses the two explicit choices', () => {
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('dark')).toBe('dark')
  })

  it('treats a missing cookie as system', () => {
    expect(parseTheme(undefined)).toBe('system')
  })

  // The literal string "system" is never written to the cookie (absence means
  // system), but a stale or hand-edited cookie must not break rendering.
  it('treats junk and the literal "system" as system', () => {
    expect(parseTheme('system')).toBe('system')
    expect(parseTheme('')).toBe('system')
    expect(parseTheme('DARK')).toBe('system')
    expect(parseTheme('<script>')).toBe('system')
  })
})
