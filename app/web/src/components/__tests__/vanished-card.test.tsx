import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { VanishedCard } from '@/components/vanished-card'

describe('VanishedCard', () => {
  it('shows a "?" for the missing variant', () => {
    render(<VanishedCard variant="missing" />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  // Drawn, not typed: a text star would render from whatever font the platform
  // happens to fall back to, so the mark has to be a path.
  it('draws the star for the dissolving variant instead of typing it', () => {
    const { container } = render(<VanishedCard variant="dissolving" />)
    expect(container.textContent).not.toContain('✦')
    // the centre mark plus the two corner sparkles
    expect(container.querySelectorAll('svg path')).toHaveLength(3)
  })

  it('draws the corner sparkles as paths on the missing variant too', () => {
    const { container } = render(<VanishedCard variant="missing" />)
    expect(container.textContent).toBe('?')
    expect(container.querySelectorAll('svg path')).toHaveLength(2)
  })

  it('scales the card box with the size prop', () => {
    const { container: lg } = render(<VanishedCard variant="missing" size="lg" />)
    const { container: sm } = render(<VanishedCard variant="missing" size="sm" />)
    expect(lg.querySelector('.h-80')).not.toBeNull()
    expect(sm.querySelector('.h-24')).not.toBeNull()
  })

  it('merges a className onto the outer wrapper', () => {
    const { container } = render(<VanishedCard variant="missing" className="mb-8" />)
    expect(container.firstElementChild?.className).toContain('mb-8')
  })

  it('hides the decorative marks from assistive tech', () => {
    const { container } = render(<VanishedCard variant="missing" />)
    const marks = container.querySelectorAll('[aria-hidden="true"]')
    expect(marks.length).toBe(3) // symbol plus two sparkles
  })
})
