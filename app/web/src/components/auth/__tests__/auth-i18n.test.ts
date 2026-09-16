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

  it('carries the terms notice with its button placeholder in both locales', () => {
    for (const m of [en, de]) {
      expect(m.auth.termsNotice).toContain('{button}')
      expect(m.auth.termsNotice).toContain('<terms>')
      expect(m.auth.termsNotice).toContain('<rules>')
      expect(m.auth.termsNotice).toContain('<privacy>')
    }
  })
})
