import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BRAND_NAME } from '@/lib/brand'

const { mockPath } = vi.hoisted(() => ({ mockPath: { value: '/' } }))
vi.mock('@/../i18n/navigation', () => ({ usePathname: () => mockPath.value }))

import { HeaderBrandMark } from '@/components/header-brand-mark'

describe('HeaderBrandMark', () => {
  it('shows only the full wordmark on the home page (no search present)', () => {
    mockPath.value = '/'
    render(<HeaderBrandMark />)
    // BrandMark ships both theme variants and CSS hides one, so two named
    // images is correct here. "Only the wordmark" is about the square icon
    // being absent, not about the count.
    const srcs = screen.getAllByAltText(BRAND_NAME).map((l) => l.getAttribute('src'))
    expect(srcs.some((s) => s?.includes('revelio-logo-primary.svg'))).toBe(true)
    expect(srcs.some((s) => s?.includes('revelio-logo-dark.svg'))).toBe(true)
    expect(srcs.some((s) => s?.includes('revelio-icon.svg'))).toBe(false)
  })

  it('renders the icon for phones and the wordmark for >=640px off the home page', () => {
    mockPath.value = '/search'
    render(<HeaderBrandMark />)
    const logos = screen.getAllByAltText(BRAND_NAME)
    const icon = logos.find((l) => l.getAttribute('src')?.includes('revelio-icon.svg'))
    const wordmark = logos.find((l) => l.getAttribute('src')?.includes('revelio-logo-primary.svg'))
    expect(icon).toBeTruthy()
    expect(wordmark).toBeTruthy()
    // Icon shows on phones, hides at >=640px; wordmark is the inverse.
    expect(icon).toHaveClass('min-[640px]:hidden')
    expect(wordmark?.parentElement).toHaveClass('hidden', 'min-[640px]:block')
  })
})
