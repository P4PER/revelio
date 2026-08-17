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

  // Config guard: a typo in either theme's lesson palette fails here.
  it('registers all five lesson colors in both themes', async () => {
    const css = await readFile(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')
    const expected: Record<string, { light: string; dark: string }> = {
      cmc: { light: '#6B4F35', dark: '#836444' },
      charms: { light: '#005A90', dark: '#0069A9' },
      potions: { light: '#00784A', dark: '#00A661' },
      transfiguration: { light: '#A32F3D', dark: '#BC3E4D' },
      quidditch: { light: '#8F6510', dark: '#E2AE37' },
    }
    for (const [code, { light, dark }] of Object.entries(expected)) {
      expect(css).toMatch(new RegExp(`--light-lesson-${code}\\s*:\\s*${light}`, 'i'))
      expect(css).toMatch(new RegExp(`--dark-lesson-${code}\\s*:\\s*${dark}`, 'i'))
    }
  })
})
