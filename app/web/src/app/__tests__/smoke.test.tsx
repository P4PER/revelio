import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { BRAND_NAME } from '@/lib/brand'

function Hello() {
  return <h1>{BRAND_NAME}</h1>
}

describe('test setup', () => {
  it('renders a component via testing-library', () => {
    render(<Hello />)
    expect(screen.getByRole('heading', { name: BRAND_NAME })).toBeInTheDocument()
  })
})
