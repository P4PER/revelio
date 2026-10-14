import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { OwlPostEmblem } from '@/components/legal/owl-post-emblem'

function emblem(container: HTMLElement) {
  const el = container.querySelector('[data-slot="owl-post-emblem"]')
  if (!el) throw new Error('emblem not rendered')
  return el as HTMLElement
}

describe('OwlPostEmblem', () => {
  it('is decorative', () => {
    const { container } = render(<OwlPostEmblem />)
    expect(emblem(container)).toHaveAttribute('aria-hidden', 'true')
  })

  it('stands still by default, with no animation classes', () => {
    const { container } = render(<OwlPostEmblem />)
    expect(emblem(container)).toHaveAttribute('data-state', 'still')
    expect(container.innerHTML).not.toContain('animate-')
  })

  it('animates when flying, only for users who allow motion', () => {
    const { container } = render(<OwlPostEmblem flying />)
    expect(emblem(container)).toHaveAttribute('data-state', 'flying')
    const animated = Array.from(container.querySelectorAll('[class*="animate-"]'))
    expect(animated.length).toBeGreaterThanOrEqual(3)
    for (const el of animated) {
      const classes = (el.getAttribute('class') ?? '').split(/\s+/).filter((c) => c.includes('animate-'))
      for (const c of classes) expect(c.startsWith('motion-safe:')).toBe(true)
    }
  })

  it('passes a className through to the wrapper', () => {
    const { container } = render(<OwlPostEmblem className="lg:hidden" />)
    expect(emblem(container)).toHaveClass('lg:hidden')
  })
})
