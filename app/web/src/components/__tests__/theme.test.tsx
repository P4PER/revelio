import { render, screen } from '@testing-library/react'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { Badge } from '@/components/ui/badge'

describe('theme + shadcn', () => {
  it('renders a shadcn Badge (proves cn + ui components work)', () => {
    render(<Badge>Rare</Badge>)
    expect(screen.getByText('Rare')).toBeInTheDocument()
  })

  // Genuine config guard: assert the five lesson-color tokens are actually
  // registered in globals.css with the correct hex (a typo would fail here,
  // unlike a class-attribute string check).
  it('registers all five lesson colors as theme tokens', async () => {
    const css = await readFile(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
    const expected: Record<string, string> = {
      care_of_magical_creatures: '#5CB878',
      charms: '#5B8DEF',
      potions: '#A06CD5',
      transfiguration: '#E0555B',
      quidditch: '#EA7B3C',
    }
    for (const [code, hex] of Object.entries(expected)) {
      expect(css).toMatch(new RegExp(`--color-lesson-${code}\\s*:\\s*${hex}`, 'i'))
    }
  })
})
