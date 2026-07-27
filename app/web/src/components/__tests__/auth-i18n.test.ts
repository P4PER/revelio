import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

describe('auth i18n', () => {
  it('has the new keys and dropped sendCode in both locales', () => {
    for (const m of [en, de]) {
      expect(m.auth.login).toBeTruthy()
      expect(m.auth.differentEmail).toBeTruthy()
      expect(m.auth.code).toBeTruthy()
      expect('sendCode' in m.auth).toBe(false)
    }
  })

  it('keeps identical auth key sets across locales', () => {
    expect(Object.keys(en.auth).sort()).toEqual(Object.keys(de.auth).sort())
  })
})
