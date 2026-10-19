import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { BRAND_NAME } from '@/lib/brand'

const { mockPath } = vi.hoisted(() => ({ mockPath: { value: '/' } }))
vi.mock('@/../i18n/navigation', () => ({ usePathname: () => mockPath.value }))

import { HeaderBrandMark } from '@/components/layout/header-brand-mark'

describe('HeaderBrandMark', () => {
  it('shows only the full wordmark on the home page (no search present)', () => {
    mockPath.value = '/'
    render(<HeaderBrandMark />)
    // BrandMark ships both theme variants and CSS hides one, so two named
    // images is correct here. "Only the wordmark" is about the square icon
    // being absent, not about the count.
    const srcs = screen.getAllByAltText(BRAND_NAME).map((l) => l.getAttribute('src'))
    expect(srcs.some((s) => s?.includes('revelio-logo-on-light.svg'))).toBe(true)
    expect(srcs.some((s) => s?.includes('revelio-logo-on-dark.svg'))).toBe(true)
    expect(srcs.some((s) => s?.includes('revelio-icon-on-light.svg'))).toBe(false)
    expect(srcs.some((s) => s?.includes('revelio-icon-on-dark.svg'))).toBe(false)
  })

  it('renders the icon for phones and the wordmark for >=640px off the home page', () => {
    mockPath.value = '/search'
    render(<HeaderBrandMark />)
    const logos = screen.getAllByAltText(BRAND_NAME)
    const src = (name: string) => logos.find((l) => l.getAttribute('src')?.includes(name))
    const lightIcon = src('revelio-icon-on-light.svg')
    const darkIcon = src('revelio-icon-on-dark.svg')
    const wordmark = src('revelio-logo-on-light.svg')
    expect(wordmark).toBeTruthy()
    // CSS picks the icon for the theme, as BrandMark does for the wordmark.
    expect(lightIcon).toHaveClass('dark:hidden')
    expect(darkIcon).toHaveClass('hidden', 'dark:block')
    // Both icons show on phones and hide at >=640px; the wordmark is the inverse.
    expect(lightIcon?.parentElement).toBe(darkIcon?.parentElement)
    expect(lightIcon?.parentElement).toHaveClass('min-[640px]:hidden')
    expect(wordmark?.parentElement).toHaveClass('hidden', 'min-[640px]:block')
  })
})
