import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { TERMS_VERSION, TERMS_EFFECTIVE_DATE, needsTermsAcceptance } from '../terms'

// The terms text TERMS_VERSION was published with, as a SHA-256 over both
// language files with whitespace collapsed. Update it only together with
// TERMS_VERSION.
const PINNED_TERMS = {
  version: '2026-09-16',
  sha256: '6b634d5e2ca424c60e7f9d27e59d77662bb74db1b51a316649e33cfc9f97bdb4',
}

// Joined by hand: Vite rewrites `new URL('x.mdx', import.meta.url)` into an
// import of the compiled MDX module, not a file path.
const LEGAL_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../content/legal')

function termsTextHash(): string {
  const hash = createHash('sha256')
  for (const locale of ['en', 'de']) {
    const path = join(LEGAL_DIR, `terms.${locale}.mdx`)
    // Whitespace is collapsed so that reflowing a paragraph or a Windows
    // checkout's line endings do not count as a new text; wording does.
    hash.update(readFileSync(path, 'utf8').replace(/\s+/g, ' ').trim())
    hash.update('\0')
  }
  return hash.digest('hex')
}

describe('TERMS_VERSION', () => {
  // The version is what Phase 2 stores per user, so it must stay a plain,
  // sortable date string rather than drifting into a free-form label.
  it('is an ISO calendar date', () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('derives the effective date from the version at UTC midnight', () => {
    expect(TERMS_EFFECTIVE_DATE.toISOString()).toBe(`${TERMS_VERSION}T00:00:00.000Z`)
  })

  // An account's stored version is the only record of which text it agreed
  // to, so an edit to the terms that keeps the old version would silently
  // change what existing acceptances refer to. Any change to either file
  // fails here until the version is bumped along with the pinned hash.
  it('is bumped whenever the terms text changes', () => {
    expect(
      { version: TERMS_VERSION, sha256: termsTextHash() },
      'content/legal/terms.*.mdx changed: set TERMS_VERSION to the new effective date, ' +
        'then update PINNED_TERMS to that version and the hash shown here',
    ).toEqual(PINNED_TERMS)
  })
})

describe('needsTermsAcceptance', () => {
  it('asks an account that never accepted', () => {
    expect(needsTermsAcceptance(null)).toBe(true)
    expect(needsTermsAcceptance(undefined)).toBe(true)
  })

  it('asks an account on an older version', () => {
    expect(needsTermsAcceptance('2000-01-01')).toBe(true)
  })

  it('leaves an account on the current version alone', () => {
    expect(needsTermsAcceptance(TERMS_VERSION)).toBe(false)
  })
})
