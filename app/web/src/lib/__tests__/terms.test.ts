import { describe, it, expect } from 'vitest'
import { TERMS_VERSION, TERMS_EFFECTIVE_DATE } from '../terms'

describe('TERMS_VERSION', () => {
  // The version is what Phase 2 stores per user, so it must stay a plain,
  // sortable date string rather than drifting into a free-form label.
  it('is an ISO calendar date', () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('derives the effective date from the version at UTC midnight', () => {
    expect(TERMS_EFFECTIVE_DATE.toISOString()).toBe(`${TERMS_VERSION}T00:00:00.000Z`)
  })
})
