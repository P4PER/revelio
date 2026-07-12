import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LessonIcons } from '@/components/lesson-icons'

describe('LessonIcons', () => {
  it('renders one image per lesson code', () => {
    render(<LessonIcons codes={['charms', 'potions']} />)
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.getByAltText('potions')).toHaveAttribute('src', '/lessons/potions.svg')
  })

  it('caps icons and shows a +N overflow chip', () => {
    render(<LessonIcons codes={['charms', 'potions', 'quidditch', 'transfiguration', 'care_of_magical_creatures']} max={3} />)
    expect(screen.getAllByRole('img')).toHaveLength(3)
    expect(screen.getByText('+2')).toBeInTheDocument()
  })

  it('renders nothing for an empty list', () => {
    const { container } = render(<LessonIcons codes={[]} />)
    expect(container.querySelectorAll('img')).toHaveLength(0)
  })
})
