import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BrandMark } from '../brand-mark'
import { BRAND_NAME } from '@/lib/brand'

describe('BrandMark', () => {
  it('renders the logo with an accessible name', () => {
    render(<BrandMark />)
    expect(screen.getByAltText(BRAND_NAME)).toBeInTheDocument()
  })
})
