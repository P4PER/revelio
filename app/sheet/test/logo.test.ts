import { readFile } from 'node:fs/promises'
import { describe, it, expect } from 'vitest'

// The sheet image builds from app/, which cannot reach the repo root's logos/,
// so the service ships a copy. This is what stops a brand update from quietly
// skipping the sheet.
describe('revelio-logo.svg', () => {
  it('is byte for byte the brand guide dark logo', async () => {
    const shipped = await readFile(new URL('../src/revelio-logo.svg', import.meta.url))
    const brand = await readFile(new URL('../../../logos/revelio-logo-dark.svg', import.meta.url))
    expect(shipped.equals(brand)).toBe(true)
  })
})
