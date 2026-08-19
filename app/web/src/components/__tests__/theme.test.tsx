import { render, screen } from '@testing-library/react'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { Badge } from '@/components/ui/badge'
import { LESSONS } from '@revelio/core'

describe('theme + shadcn', () => {
  it('renders a shadcn Badge (proves cn + ui components work)', () => {
    render(<Badge>Rare</Badge>)
    expect(screen.getByText('Rare')).toBeInTheDocument()
  })

  // Config guard: every lesson in the domain model needs a custom property in
  // both themes, because lesson-colors.ts builds `var(--lesson-<code>)` from
  // the code itself - a missing token paints nothing at all. The values are
  // asserted in theme-contrast.test.ts, which checks the property that actually
  // matters (AA in both roles) rather than restating the hexes here.
  it('registers every lesson colour in both themes, and wires up the alias', async () => {
    const css = await readFile(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
    for (const { code } of LESSONS) {
      expect(css).toMatch(new RegExp(`--light-lesson-${code}\\s*:\\s*#[0-9a-f]{6}`, 'i'))
      expect(css).toMatch(new RegExp(`--dark-lesson-${code}\\s*:\\s*#[0-9a-f]{6}`, 'i'))
      expect(css).toMatch(new RegExp(`--lesson-${code}\\s*:\\s*var\\(--light-lesson-${code}\\)`, 'i'))
      expect(css).toMatch(new RegExp(`--lesson-${code}\\s*:\\s*var\\(--dark-lesson-${code}\\)`, 'i'))
    }
  })
})
