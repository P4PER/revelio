import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, utimesSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileVersion } from '../src/image-versions.js'

describe('fileVersion', () => {
  it('returns the file mtime in epoch seconds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'iv-'))
    const p = join(dir, 'x.webp')
    writeFileSync(p, 'x')
    utimesSync(p, new Date(1_700_000_000_000), new Date(1_700_000_000_000))
    expect(fileVersion(p)).toBe(1_700_000_000)
  })

  it('returns null for a missing file', () => {
    expect(fileVersion('/nope/does-not-exist.webp')).toBeNull()
  })
})
