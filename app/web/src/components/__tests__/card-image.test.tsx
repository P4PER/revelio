import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CardImage, isHorizontal } from '../card-image'

vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => <img alt={p.alt as string} /> }))

describe('isHorizontal', () => {
  it('is true only for the exact horizontal string', () => {
    expect(isHorizontal('horizontal')).toBe(true)
    expect(isHorizontal('vertical')).toBe(false)
    expect(isHorizontal(null)).toBe(false)
    expect(isHorizontal(undefined)).toBe(false)
  })
})

describe('CardImage', () => {
  it('renders a portrait frame by default', () => {
    const { container } = render(<CardImage src="s" alt="Fluffy" orientation="horizontal" />)
    expect(container.querySelector('.aspect-\\[5\\/7\\]')).not.toBeNull()
    expect(container.querySelector('.aspect-\\[7\\/5\\]')).toBeNull()
    expect(screen.getByAltText('Fluffy')).toBeInTheDocument()
  })

  it('renders an upright landscape frame for a horizontal card when upright', () => {
    const { container } = render(<CardImage src="s" alt="Fluffy" orientation="horizontal" upright />)
    expect(container.querySelector('.aspect-\\[7\\/5\\]')).not.toBeNull()
    expect(container.querySelector('.rotate-90')).not.toBeNull()
  })

  it('ignores upright for a vertical card', () => {
    const { container } = render(<CardImage src="s" alt="Wand" orientation="vertical" upright />)
    expect(container.querySelector('.aspect-\\[5\\/7\\]')).not.toBeNull()
    expect(container.querySelector('.rotate-90')).toBeNull()
  })
})
