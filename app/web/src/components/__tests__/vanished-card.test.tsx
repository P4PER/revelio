import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { VanishedCard } from '@/components/vanished-card'

describe('VanishedCard', () => {
  it('shows a "?" for the missing variant', () => {
    render(<VanishedCard variant="missing" />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })

  it('shows a star for the dissolving variant', () => {
    const { container } = render(<VanishedCard variant="dissolving" />)
    expect(container.textContent).toContain('✦')
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
