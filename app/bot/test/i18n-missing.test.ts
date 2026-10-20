import { describe, it, expect, vi } from 'vitest'
import { t } from '../src/i18n/t'

// No real message nests an argument inside a plural branch, names one after
// an Object.prototype member or carries Discord markup yet, so they are added
// here.
vi.mock('../src/i18n/en.json', async (importOriginal) => ({
  default: {
    ...(await importOriginal<{ default: Record<string, string> }>()).default,
    'test.nested': '{count, plural, one {{user} shared a card.} other {{user} shared {count} cards.}}',
    'test.proto': 'Built by {constructor}.',
    'test.markup': 'Updated <t:{ts}:R> in <#{channel}>.',
  },
}))

describe('t with an argument missing inside a plural branch', () => {
  it('leaves that placeholder visible and still picks the branch', () => {
    expect(t('en', 'test.nested', { count: 1 })).toBe('{user} shared a card.')
    expect(t('en', 'test.nested', { count: 3 })).toBe('{user} shared 3 cards.')
    expect(t('en', 'test.nested', { count: 3, user: 'Ron' })).toBe('Ron shared 3 cards.')
  })

  it('does not take an Object.prototype member for a supplied value', () => {
    expect(t('en', 'test.proto')).toBe('Built by {constructor}.')
  })

  it('reads Discord markup as text, not as a tag', () => {
    expect(t('en', 'test.markup', { ts: 1700000000, channel: '42' }))
      .toBe('Updated <t:1700000000:R> in <#42>.')
    expect(t('en', 'test.markup', { ts: 1700000000 })).toBe('Updated <t:1700000000:R> in <#{channel}>.')
  })
})
