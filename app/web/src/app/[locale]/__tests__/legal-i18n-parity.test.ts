import { describe, it, expect } from 'vitest'
import en from '@/../messages/en.json'
import de from '@/../messages/de.json'

// The legal/about pages render every key unconditionally, so a key present in
// one locale but missing in the other throws MISSING_MESSAGE at render for that
// locale. Guard en/de key parity for these namespaces.
describe('legal/about i18n key parity', () => {
  for (const ns of ['about', 'privacy', 'imprint'] as const) {
    it(`${ns}: en and de expose the same keys`, () => {
      const enKeys = Object.keys((en as Record<string, object>)[ns]).sort()
      const deKeys = Object.keys((de as Record<string, object>)[ns]).sort()
      expect(deKeys).toEqual(enKeys)
    })
  }
})
