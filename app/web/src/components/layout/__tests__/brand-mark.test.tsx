import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BrandMark } from '@/components/layout/brand-mark'
import { BRAND_NAME } from '@/lib/brand'

describe('BrandMark', () => {
  // Both variants are always in the DOM and CSS hides one, so the logo is
  // correct under prefers-color-scheme with no JS and no cookie.
  it('renders a dark-background and a light-background wordmark', () => {
    const { container } = render(<BrandMark />)
    const srcs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(srcs.some((s) => s?.includes('revelio-logo-dark'))).toBe(true)
    expect(srcs.some((s) => s?.includes('revelio-logo-primary'))).toBe(true)
  })

  // display:none removes the hidden variant from the accessibility tree, so
  // naming both is what leaves exactly one name at runtime - and it keeps the
  // footer wordmark named, which has no wrapping aria-label to fall back on.
  it('names both variants so the visible one is always announced', () => {
    const { container } = render(<BrandMark />)
    const imgs = [...container.querySelectorAll('img')]
    expect(imgs).toHaveLength(2)
    for (const img of imgs) {
      expect(img.getAttribute('alt')).toBe(BRAND_NAME)
      expect(img.hasAttribute('aria-hidden')).toBe(false)
    }
  })
})
