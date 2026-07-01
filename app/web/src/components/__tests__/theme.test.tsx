import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Badge } from '@/components/ui/badge'

describe('theme + shadcn', () => {
  it('renders a shadcn Badge (proves cn + ui components work)', () => {
    render(<Badge>Rare</Badge>)
    expect(screen.getByText('Rare')).toBeInTheDocument()
  })

  it('applies a lesson-color utility class', () => {
    render(<span className="bg-lesson-charms" data-testid="chip">Charms</span>)
    expect(screen.getByTestId('chip')).toHaveClass('bg-lesson-charms')
  })
})
