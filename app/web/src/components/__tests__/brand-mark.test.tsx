import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BrandMark } from '../brand-mark'

describe('BrandMark', () => {
  it('renders the logo with an accessible name', () => {
    render(<BrandMark />)
    expect(screen.getByAltText('Revelio')).toBeInTheDocument()
  })
})
