import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BRAND_NAME } from '@/lib/brand'

const { mockPath } = vi.hoisted(() => ({ mockPath: { value: '/' } }))
vi.mock('@/../i18n/navigation', () => ({ usePathname: () => mockPath.value }))

import { HeaderBrandMark } from '../header-brand-mark'

describe('HeaderBrandMark', () => {
  it('shows only the full wordmark on the home page (no search present)', () => {
    mockPath.value = '/'
    render(<HeaderBrandMark />)
    const logos = screen.getAllByAltText(BRAND_NAME)
    expect(logos).toHaveLength(1)
    expect(logos[0]).toHaveAttribute('src', expect.stringContaining('revelio-logo-dark.svg'))
  })

  it('renders the icon for phones and the wordmark for >=640px off the home page', () => {
    mockPath.value = '/search'
    render(<HeaderBrandMark />)
    const logos = screen.getAllByAltText(BRAND_NAME)
    const icon = logos.find((l) => l.getAttribute('src')?.includes('revelio-icon.svg'))
    const wordmark = logos.find((l) => l.getAttribute('src')?.includes('revelio-logo-dark.svg'))
    expect(icon).toBeTruthy()
    expect(wordmark).toBeTruthy()
    // Icon shows on phones, hides at >=640px; wordmark is the inverse.
    expect(icon).toHaveClass('min-[640px]:hidden')
    expect(wordmark?.parentElement).toHaveClass('hidden', 'min-[640px]:block')
  })
})
