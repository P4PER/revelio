import { describe, it, expect, vi } from 'vitest'
import { t } from '../src/i18n/t'

// No real message nests an argument inside a plural branch yet, so one is
// added here to prove t() walks into the branches.
vi.mock('../src/i18n/en.json', async (importOriginal) => ({
  default: {
    ...(await importOriginal<{ default: Record<string, string> }>()).default,
    'test.nested': '{count, plural, one {{user} shared a card.} other {{user} shared # cards.}}',
  },
}))

describe('t with an argument missing inside a plural branch', () => {
  it('leaves that placeholder visible and still picks the branch', () => {
    expect(t('en', 'test.nested', { count: 1 })).toBe('{user} shared a card.')
    expect(t('en', 'test.nested', { count: 3 })).toBe('{user} shared 3 cards.')
    expect(t('en', 'test.nested', { count: 3, user: 'Ron' })).toBe('Ron shared 3 cards.')
  })
})
