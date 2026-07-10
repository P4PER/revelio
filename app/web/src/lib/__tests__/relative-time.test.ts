import { describe, it, expect } from 'vitest'
import { formatRelativeTime } from '@/lib/relative-time'

const NOW = Date.parse('2026-07-10T12:00:00Z')

describe('formatRelativeTime', () => {
  it('formats seconds, days, and months (en)', () => {
    expect(formatRelativeTime('2026-07-10T11:59:30Z', 'en', NOW)).toBe('30 seconds ago')
    expect(formatRelativeTime('2026-07-08T12:00:00Z', 'en', NOW)).toBe('2 days ago')
    expect(formatRelativeTime('2026-05-11T12:00:00Z', 'en', NOW)).toBe('2 months ago')
  })

  it('respects the locale (de)', () => {
    expect(formatRelativeTime('2026-07-08T12:00:00Z', 'de', NOW)).toBe('vor 2 Tagen')
  })
})
