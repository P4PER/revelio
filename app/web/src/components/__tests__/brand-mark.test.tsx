import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BrandMark } from '@/components/brand-mark'

describe('BrandMark', () => {
  // Both variants are always in the DOM and CSS hides one, so the logo is
  // correct under prefers-color-scheme with no JS and no cookie.
  it('renders a dark-background and a light-background wordmark', () => {
    const { container } = render(<BrandMark />)
    const srcs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(srcs.some((s) => s?.includes('revelio-logo-dark'))).toBe(true)
    expect(srcs.some((s) => s?.includes('revelio-logo-primary'))).toBe(true)
  })

  it('exposes exactly one accessible name', () => {
    const { container } = render(<BrandMark />)
    const labelled = [...container.querySelectorAll('img')].filter(
      (i) => (i.getAttribute('alt') ?? '') !== '',
    )
    expect(labelled).toHaveLength(1)
  })
})
