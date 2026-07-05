import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LessonCost } from '../lesson-cost'

describe('LessonCost', () => {
  it('renders the lesson symbol for the code with the cost number overlaid', () => {
    render(<LessonCost lesson="transfiguration" cost={5} label="Transfiguration" />)
    const pip = screen.getByRole('img', { name: '5 Transfiguration' })
    expect(pip.querySelector('img')).toHaveAttribute('src', '/lessons/transfiguration.svg')
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('renders a two-digit cost the same size as a single digit', () => {
    render(<LessonCost lesson="potions" cost={12} label="Potions" />)
    expect(screen.getByRole('img', { name: '12 Potions' })).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('omits the number when cost is null', () => {
    render(<LessonCost lesson="charms" cost={null} label="Charms" />)
    expect(screen.getByRole('img', { name: 'Charms' })).toBeInTheDocument()
    expect(screen.queryByText(/\d/)).toBeNull()
  })
})
